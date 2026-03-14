/* 역할: 플레이어 측 자동전투 판단, 후보 점수화, 실행 예약과 안전 종료를 담당한다. */

(function attachBattleAuto(global) {
  function createState(enabled) {
    return {
      enabled: !!enabled,
      running: false,
      turnScoped: false,
      lastActorId: null,
      cancelRequested: false,
      suspendReason: null,
      planVersion: 0,
      reservedTargets: {},
      reservedTiles: {},
      lastActionSummary: null,
      stepRetryCount: 0,
      stepTimer: 0,
      lastBattleId: null,
      lastTurnNumber: null
    };
  }

  function createController(hooks) {
    function getViewState() {
      return hooks.getViewState();
    }

    function getState() {
      return getViewState().autoBattle;
    }

    function clearTimer() {
      const autoBattle = getState();

      if (autoBattle && autoBattle.stepTimer) {
        global.clearTimeout(autoBattle.stepTimer);
        autoBattle.stepTimer = 0;
      }
    }

    function resetReservations() {
      const autoBattle = getState();
      autoBattle.reservedTargets = {};
      autoBattle.reservedTiles = {};
      autoBattle.stepRetryCount = 0;
    }

    function getReasonLabel(reason) {
      return reason === "enemy-phase"
        ? "적 턴 대기"
        : reason === "modal"
          ? "모달 대기"
          : reason === "manual-input"
            ? "수동 해제 대기"
            : reason === "animation"
              ? "연출 대기"
              : reason === "battle-end"
                ? "전투 종료"
                : reason === "error"
                  ? "오류 정지"
                  : "대기";
    }

    function getButtonState(snapshot) {
      const autoBattle = getState();

      if (!autoBattle.enabled) {
        return {
          label: "자동전투",
          title: "자동전투를 켭니다.",
          className: "ghost-button"
        };
      }

      return {
        label: "자동전투중",
        title: autoBattle.running
          ? "자동전투가 현재 행동을 수행 중입니다."
          : !snapshot || !snapshot.battle || snapshot.battle.status !== "in_progress"
            ? "다음 전투에서도 자동전투가 유지됩니다."
            : autoBattle.cancelRequested
              ? "현재 행동이 끝난 뒤 자동전투가 해제됩니다."
              : `자동전투가 ${getReasonLabel(autoBattle.suspendReason)} 상태입니다.`,
        className: "secondary-button auto-battle-active"
      };
    }

    function persistPreference(enabled) {
      const liveSession = hooks.getLiveSession();
      const viewState = getViewState();

      if (!liveSession) {
        return;
      }

      const settings = Object.assign({}, liveSession.settings || viewState.snapshot && viewState.snapshot.settings || {}, {
        autoBattleEnabled: !!enabled
      });

      liveSession.settings = settings;
      if (viewState.sessionRef) {
        viewState.sessionRef.settings = settings;
      }

      if (viewState.snapshot) {
        viewState.snapshot.settings = settings;
      }

      hooks.persistSession(
        viewState.snapshot && viewState.snapshot.saveData
          ? viewState.snapshot.saveData
          : liveSession.saveData,
        settings
      );
    }

    function setEnabled(enabled, options) {
      const nextOptions = options || {};
      const autoBattle = getState();
      const viewState = getViewState();

      autoBattle.enabled = !!enabled;
      autoBattle.running = false;
      autoBattle.cancelRequested = false;
      autoBattle.suspendReason = enabled ? autoBattle.suspendReason : (nextOptions.reason || "manual-input");
      autoBattle.stepRetryCount = 0;
      clearTimer();

      if (!enabled) {
        resetReservations();
      }

      if (nextOptions.persist !== false) {
        persistPreference(enabled);
      }

      if (viewState.snapshot) {
        hooks.renderToolbar(viewState.snapshot);
      }

      if (enabled) {
        maybeSchedule(viewState.snapshot, 120);
      }
    }

    function handleToggle() {
      const viewState = getViewState();
      const snapshot = viewState ? viewState.snapshot : null;
      const autoBattle = getState();

      if (hooks.isAutoBattleAvailable && !hooks.isAutoBattleAvailable(snapshot)) {
        return;
      }

      if (autoBattle.enabled) {
        setEnabled(false, { reason: "manual-input" });
        return;
      }

      setEnabled(true, { reason: null });
    }

    function requestCancel(reason) {
      const autoBattle = getState();
      const viewState = getViewState();

      if (!autoBattle.enabled) {
        return;
      }

      if (viewState.aiRunning || autoBattle.running) {
        autoBattle.cancelRequested = true;
        autoBattle.suspendReason = reason || "manual-input";
        if (viewState.snapshot) {
          hooks.renderToolbar(viewState.snapshot);
        }
        return;
      }

      setEnabled(false, { reason: reason || "manual-input" });
    }

    function getGate(snapshot) {
      const autoBattle = getState();
      const viewState = getViewState();

      if (!autoBattle.enabled) {
        return { canRun: false, reason: "manual-input" };
      }

      if (hooks.isAutoBattleAvailable && !hooks.isAutoBattleAvailable(snapshot)) {
        return { canRun: false, reason: "unavailable" };
      }

      if (!snapshot || !snapshot.battle) {
        return { canRun: false, reason: "battle-end" };
      }

      if (snapshot.battle.status !== "in_progress") {
        return { canRun: false, reason: "battle-end" };
      }

      if (viewState.modal) {
        return { canRun: false, reason: "modal" };
      }

      if (viewState.aiRunning || autoBattle.running) {
        return { canRun: false, reason: snapshot.battle.phase === "enemy" ? "enemy-phase" : "animation" };
      }

      if (snapshot.battle.phase !== "player") {
        return { canRun: false, reason: "enemy-phase" };
      }

      if (snapshot.ui.pendingMove || snapshot.ui.movePreview || snapshot.ui.pendingAttack || snapshot.ui.pendingSkillId) {
        return { canRun: false, reason: "manual-input" };
      }

      return { canRun: true, reason: null };
    }

    function maybeSchedule(snapshot, delayMs) {
      const autoBattle = getState();
      const gate = getGate(snapshot);
      autoBattle.suspendReason = gate.reason;

      if (snapshot) {
        hooks.renderToolbar(snapshot);
      }

      if (!gate.canRun || autoBattle.stepTimer || autoBattle.cancelRequested) {
        return;
      }

      autoBattle.stepTimer = global.setTimeout(() => {
        autoBattle.stepTimer = 0;
        tryRunStep();
      }, Math.max(0, Number(delayMs || 0)));
    }

    function handleSnapshot(previousSnapshot, snapshot) {
      const autoBattle = getState();
      const previousBattle = previousSnapshot && previousSnapshot.battle ? previousSnapshot.battle : null;
      const nextBattle = snapshot && snapshot.battle ? snapshot.battle : null;
      const viewState = getViewState();

      if (!nextBattle) {
        clearTimer();
        autoBattle.suspendReason = "battle-end";
        return;
      }

      if (previousBattle && previousBattle.id !== nextBattle.id) {
        clearTimer();
        resetReservations();
        autoBattle.planVersion = 0;
        autoBattle.cancelRequested = false;
      }

      if (!previousBattle || previousBattle.turnNumber !== nextBattle.turnNumber || previousBattle.phase !== nextBattle.phase) {
        resetReservations();
        autoBattle.lastTurnNumber = nextBattle.turnNumber;
      }

      if (previousBattle && ((previousBattle.logs || []).length !== (nextBattle.logs || []).length)) {
        autoBattle.planVersion += 1;
      }

      autoBattle.lastBattleId = nextBattle.id;

      if (autoBattle.cancelRequested && !autoBattle.running && !viewState.aiRunning) {
        setEnabled(false, { reason: autoBattle.suspendReason || "manual-input" });
        return;
      }

      maybeSchedule(snapshot, 140);
    }

    function getRoleProfile(unit) {
      const classProfile = unit ? hooks.SkillsService.getClassProfile(unit) : null;
      const roleText = String(classProfile && classProfile.role || "");
      const weaponType = String(unit && unit.weapon && unit.weapon.type || "");
      const isHealer = /힐러|회복|보조/.test(roleText) || weaponType === "staff" || weaponType === "focus";
      const isTank = /전열|수비|선봉|유지/.test(roleText) || weaponType === "lance";
      const isRanged = ["bow", "staff", "focus", "wand", "tome", "grimoire"].includes(weaponType);

      if (isHealer) {
        return { role: "healer", aggression: 0.35, safetyBias: 1.0, healBias: 1.45, focusBias: 0.45, objectiveBias: 0.35, isRanged };
      }

      if (isTank) {
        return { role: "tank", aggression: 0.72, safetyBias: 1.2, healBias: 0.15, focusBias: 0.72, objectiveBias: 0.82, isRanged };
      }

      if (isRanged) {
        return { role: "hybrid", aggression: 0.9, safetyBias: 0.88, healBias: 0.45, focusBias: 0.86, objectiveBias: 0.52, isRanged };
      }

      return { role: "assault", aggression: 1.0, safetyBias: 0.8, healBias: 0.2, focusBias: 1.0, objectiveBias: 0.62, isRanged };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function isInsideBattleMap(snapshot, x, y) {
      return !!snapshot && !!snapshot.battle && x >= 0 && y >= 0 && x < snapshot.battle.map.width && y < snapshot.battle.map.height;
    }

    function getObjectiveTile(snapshot) {
      const defenseState = snapshot && snapshot.battle ? snapshot.battle.defenseState : null;
      const position = defenseState && defenseState.objectivePosition ? defenseState.objectivePosition : null;

      if (!position) {
        return null;
      }

      return {
        x: Number(position.x || 0),
        y: Number(position.y || 0)
      };
    }

    function isObjectiveTile(snapshot, x, y) {
      const objectiveTile = getObjectiveTile(snapshot);
      return !!objectiveTile && objectiveTile.x === x && objectiveTile.y === y;
    }

    function getAutoUnitAt(snapshot, x, y, options) {
      const nextOptions = options || {};
      const ignoredIds = new Set(nextOptions.ignoreUnitIds || []);
      return (snapshot && snapshot.battle && snapshot.battle.units || []).find((unit) =>
        unit.alive
        && unit.x === x
        && unit.y === y
        && !ignoredIds.has(unit.id)
      ) || null;
    }

    function isPassableTileForAuto(snapshot, x, y) {
      return isInsideBattleMap(snapshot, x, y)
        && hooks.getMapTileType(snapshot, x, y) !== "wall"
        && !isObjectiveTile(snapshot, x, y);
    }

    function getTileMoveCost(snapshot, x, y) {
      const terrain = hooks.CombatService.getTerrainModifier(hooks.getMapTileType(snapshot, x, y));
      return Number.isFinite(terrain.moveCost) ? terrain.moveCost : Infinity;
    }

    function buildReachableTiles(snapshot, unit, options) {
      const nextOptions = options || {};
      const movementLimit = Number.isFinite(nextOptions.movementLimit) ? nextOptions.movementLimit : Number(unit.mov || 0);
      const allowOccupiedOrigin = nextOptions.allowOccupiedOrigin !== false;
      const queue = [{ x: unit.x, y: unit.y, cost: 0, path: [] }];
      const visited = new Map([[`${unit.x},${unit.y}`, 0]]);
      const reachable = [];

      while (queue.length) {
        const current = queue.shift();

        [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 }
        ].forEach((next) => {
          const key = `${next.x},${next.y}`;

          if (!isPassableTileForAuto(snapshot, next.x, next.y)) {
            return;
          }

          const terrainCost = getTileMoveCost(snapshot, next.x, next.y);
          const climbCost = Math.max(0, hooks.getMapElevation(snapshot, next.x, next.y) - hooks.getMapElevation(snapshot, current.x, current.y));
          const nextCost = current.cost + terrainCost + climbCost;

          if (!Number.isFinite(nextCost) || nextCost > movementLimit) {
            return;
          }

          const occupant = getAutoUnitAt(snapshot, next.x, next.y, {
            ignoreUnitIds: [unit.id].concat(nextOptions.ignoreUnitIds || [])
          });
          const isOrigin = next.x === unit.x && next.y === unit.y;
          const isFriendlyOccupant = occupant && occupant.team === unit.team;

          if (occupant && !isOrigin && !isFriendlyOccupant) {
            return;
          }

          if (visited.has(key) && visited.get(key) <= nextCost) {
            return;
          }

          visited.set(key, nextCost);
          const nextPath = current.path.concat([{ x: next.x, y: next.y }]);
          queue.push({
            x: next.x,
            y: next.y,
            cost: nextCost,
            path: nextPath
          });

          if ((!(occupant && !isOrigin) || !isFriendlyOccupant) && (!isOrigin || allowOccupiedOrigin)) {
            reachable.push({
              x: next.x,
              y: next.y,
              cost: nextCost,
              path: nextPath,
              elevation: hooks.getMapElevation(snapshot, next.x, next.y)
            });
          }
        });
      }

      if (allowOccupiedOrigin) {
        reachable.unshift({
          x: unit.x,
          y: unit.y,
          cost: 0,
          path: [],
          elevation: hooks.getMapElevation(snapshot, unit.x, unit.y)
        });
      }

      return reachable;
    }

    function createSimulatedUnit(unit, origin) {
      const simulatedUnit = Object.assign({}, unit, {
        x: origin.x,
        y: origin.y
      });

      if (unit && unit.weapon) {
        simulatedUnit.weapon = Object.assign({}, unit.weapon);
      }

      return simulatedUnit;
    }

    function getDistance(fromPosition, toPosition) {
      return Math.abs(Number(fromPosition.x || 0) - Number(toPosition.x || 0)) + Math.abs(Number(fromPosition.y || 0) - Number(toPosition.y || 0));
    }

    function getAttackPreview(snapshot, attacker, origin, defender, options) {
      const nextOptions = options || {};
      return hooks.CombatService.calculatePreview(createSimulatedUnit(attacker, origin), defender, {
        attackerTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
        defenderTileType: hooks.getMapTileType(snapshot, defender.x, defender.y),
        attackerElevation: hooks.getMapElevation(snapshot, origin.x, origin.y),
        defenderElevation: hooks.getMapElevation(snapshot, defender.x, defender.y),
        phase: snapshot.battle.phase,
        isInitiator: true,
        damageType: nextOptions.damageType || null
      });
    }

    function getCounterPreview(snapshot, attacker, origin, defender) {
      return hooks.BattleService.calculateCounterPreview(createSimulatedUnit(attacker, origin), defender);
    }

    function getSkillRange(snapshot, unit, origin, skill) {
      const effectiveRange = hooks.CombatService.getEffectiveWeaponRange(createSimulatedUnit(unit, origin), {
        attackerTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
        attackerElevation: hooks.getMapElevation(snapshot, origin.x, origin.y),
        defenderElevation: hooks.getMapElevation(snapshot, origin.x, origin.y)
      });

      return {
        rangeMin: skill.useWeaponRange ? effectiveRange.rangeMin : Number(skill.rangeMin || 0),
        rangeMax: skill.useWeaponRange ? effectiveRange.rangeMax : Number(skill.rangeMax || 0)
      };
    }

    function canUseSkillAtOrigin(snapshot, origin, skill) {
      if (!skill || !Array.isArray(skill.requiredTileTypes) || !skill.requiredTileTypes.length) {
        return true;
      }

      return skill.requiredTileTypes.includes(hooks.getMapTileType(snapshot, origin.x, origin.y));
    }

    function collectSkillTargets(snapshot, unit, origin, skill) {
      const range = getSkillRange(snapshot, unit, origin, skill);

      return (snapshot.battle.units || [])
        .filter((candidate) => candidate.alive)
        .filter((candidate) => {
          if (skill.targetType === "self") {
            return candidate.id === unit.id;
          }

          if (skill.targetType === "ally") {
            return candidate.team === unit.team;
          }

          if (skill.targetType === "enemy") {
            return candidate.team !== unit.team;
          }

          return false;
        })
        .filter((candidate) => {
          const candidatePosition = candidate.id === unit.id ? origin : candidate;
          const distance = getDistance(origin, candidatePosition);
          return distance >= range.rangeMin && distance <= range.rangeMax;
        });
    }

    function collectAttackTargets(snapshot, unit, origin) {
      return (snapshot.battle.units || [])
        .filter((candidate) => candidate.alive && candidate.team !== unit.team)
        .filter((candidate) => hooks.CombatService.isInWeaponRange(createSimulatedUnit(unit, origin), origin, { x: candidate.x, y: candidate.y }, {
          attackerTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
          attackerElevation: hooks.getMapElevation(snapshot, origin.x, origin.y),
          defenderTileType: hooks.getMapTileType(snapshot, candidate.x, candidate.y),
          defenderElevation: hooks.getMapElevation(snapshot, candidate.x, candidate.y)
        }));
    }

    function isCoreUnit(snapshot, unit) {
      if (!unit) {
        return false;
      }

      if (snapshot && snapshot.saveData && snapshot.saveData.leaderUnitId === unit.id) {
        return true;
      }

      const profile = getRoleProfile(unit);
      return profile.role === "assault" || profile.role === "hybrid";
    }

    function isHealerOrRangedUnit(unit) {
      const weaponType = String(unit && unit.weapon && unit.weapon.type || "");
      const classProfile = unit ? hooks.SkillsService.getClassProfile(unit) : null;
      const roleText = String(classProfile && classProfile.role || "");
      return ["bow", "staff", "focus", "wand", "tome", "grimoire"].includes(weaponType) || /힐러|회복|마도|사격|원거리/.test(roleText);
    }

    function getThreatCacheForActor(snapshot, actor) {
      return (snapshot.battle.units || [])
        .filter((unit) => unit.team === "enemy" && unit.alive)
        .map((enemy) => ({
          enemy,
          origins: buildReachableTiles(snapshot, enemy, {
            allowOccupiedOrigin: true,
            movementLimit: Number(enemy.mov || 0),
            ignoreUnitIds: [actor.id]
          })
        }));
    }

    function estimateIncomingThreat(snapshot, actor, origin, threatCache, options) {
      const nextOptions = options || {};
      const ignoredEnemyIds = new Set(nextOptions.ignoreEnemyIds || []);
      const simulatedActor = createSimulatedUnit(actor, origin);
      let totalDamage = 0;
      let threatCount = 0;
      let maxDamage = 0;

      (threatCache || []).forEach((entry) => {
        if (!entry || !entry.enemy || ignoredEnemyIds.has(entry.enemy.id) || !entry.enemy.alive) {
          return;
        }

        let bestPreview = null;

        (entry.origins || []).forEach((enemyOrigin) => {
          if (bestPreview && bestPreview.damage >= simulatedActor.hp) {
            return;
          }

          if (!hooks.CombatService.isInWeaponRange(createSimulatedUnit(entry.enemy, enemyOrigin), enemyOrigin, origin, {
            attackerTileType: hooks.getMapTileType(snapshot, enemyOrigin.x, enemyOrigin.y),
            attackerElevation: hooks.getMapElevation(snapshot, enemyOrigin.x, enemyOrigin.y),
            defenderTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
            defenderElevation: hooks.getMapElevation(snapshot, origin.x, origin.y)
          })) {
            return;
          }

          const preview = hooks.CombatService.calculatePreview(createSimulatedUnit(entry.enemy, enemyOrigin), simulatedActor, {
            attackerTileType: hooks.getMapTileType(snapshot, enemyOrigin.x, enemyOrigin.y),
            defenderTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
            attackerElevation: hooks.getMapElevation(snapshot, enemyOrigin.x, enemyOrigin.y),
            defenderElevation: hooks.getMapElevation(snapshot, origin.x, origin.y),
            phase: snapshot.battle.phase,
            isInitiator: true
          });

          if (!preview.canAttack) {
            return;
          }

          const expectedDamage = Math.round(Number(preview.damage || 0) * clamp(Number(preview.hitRate || 0), 5, 100) / 100);

          if (!bestPreview || expectedDamage > bestPreview.expectedDamage) {
            bestPreview = {
              expectedDamage,
              damage: Number(preview.damage || 0)
            };
          }
        });

        if (!bestPreview) {
          return;
        }

        totalDamage += bestPreview.expectedDamage;
        maxDamage = Math.max(maxDamage, bestPreview.damage);
        threatCount += 1;
      });

      return {
        totalDamage,
        maxDamage,
        threatCount,
        survivableMargin: Number(actor.hp || 0) - totalDamage,
        isLethal: totalDamage >= Number(actor.hp || 0)
      };
    }

    function getNearestEnemyDistance(snapshot, origin) {
      const enemies = (snapshot.battle.units || []).filter((unit) => unit.team === "enemy" && unit.alive);

      if (!enemies.length) {
        return 0;
      }

      return enemies.reduce((bestDistance, enemy) => Math.min(bestDistance, getDistance(origin, enemy)), Infinity);
    }

    function getApproachMetrics(snapshot, actor, origin) {
      const simulatedActor = createSimulatedUnit(actor, origin);
      const weaponRange = hooks.CombatService.getEffectiveWeaponRange(simulatedActor, {
        attackerTileType: hooks.getMapTileType(snapshot, origin.x, origin.y),
        attackerElevation: hooks.getMapElevation(snapshot, origin.x, origin.y),
        defenderElevation: hooks.getMapElevation(snapshot, origin.x, origin.y)
      });
      const rangeMax = Math.max(1, Number(weaponRange && weaponRange.rangeMax || actor.weapon && actor.weapon.rangeMax || 1));
      const movement = Math.max(0, Number(actor.mov || 0));
      const enemies = (snapshot.battle.units || []).filter((unit) => unit.team === "enemy" && unit.alive);

      if (!enemies.length) {
        return {
          target: null,
          distance: 0,
          tilesToAttack: 0,
          canAttackNextTurn: false
        };
      }

      return enemies.reduce((best, enemy) => {
        const distance = getDistance(origin, enemy);
        const tilesToAttack = Math.max(0, distance - rangeMax);
        const canAttackNextTurn = tilesToAttack <= movement;

        if (!best) {
          return {
            target: enemy,
            distance,
            tilesToAttack,
            canAttackNextTurn
          };
        }

        if (tilesToAttack !== best.tilesToAttack) {
          return tilesToAttack < best.tilesToAttack
            ? { target: enemy, distance, tilesToAttack, canAttackNextTurn }
            : best;
        }

        if (distance !== best.distance) {
          return distance < best.distance
            ? { target: enemy, distance, tilesToAttack, canAttackNextTurn }
            : best;
        }

        if (isHealerOrRangedUnit(enemy) && !isHealerOrRangedUnit(best.target)) {
          return { target: enemy, distance, tilesToAttack, canAttackNextTurn };
        }

        return best;
      }, null);
    }

    function getTileNeighborCount(snapshot, origin) {
      return [
        { x: origin.x + 1, y: origin.y },
        { x: origin.x - 1, y: origin.y },
        { x: origin.x, y: origin.y + 1 },
        { x: origin.x, y: origin.y - 1 }
      ].filter((tile) => isPassableTileForAuto(snapshot, tile.x, tile.y)).length;
    }

    function buildPositioningScore(snapshot, currentOrigin, nextOrigin, roleProfile, currentThreat, nextThreat) {
      const terrain = hooks.CombatService.getTerrainModifier(hooks.getMapTileType(snapshot, nextOrigin.x, nextOrigin.y));
      const objectiveTile = getObjectiveTile(snapshot);
      const currentEnemyDistance = getNearestEnemyDistance(snapshot, currentOrigin);
      const nextEnemyDistance = getNearestEnemyDistance(snapshot, nextOrigin);
      let score = 0;

      if (terrain.defense > 0) {
        score += 8;
      }

      if (currentThreat && nextThreat && currentThreat.threatCount > nextThreat.threatCount) {
        score += 10;
      }

      if (nextEnemyDistance < currentEnemyDistance) {
        score += 6 * roleProfile.objectiveBias;
      }

      if (objectiveTile && getDistance(nextOrigin, objectiveTile) < getDistance(currentOrigin, objectiveTile)) {
        score += 4 * roleProfile.objectiveBias;
      }

      if (roleProfile.role === "tank" && getTileNeighborCount(snapshot, nextOrigin) <= 2) {
        score += 12;
      }

      return score;
    }

    function buildSafetyScore(actor, threat) {
      if (!threat) {
        return 0;
      }

      if (threat.survivableMargin <= 0) {
        return -100;
      }

      if (threat.survivableMargin < Number(actor.maxHp || 1) * 0.2) {
        return -35;
      }

      if (threat.survivableMargin > Number(actor.maxHp || 1) * 0.5) {
        return 10;
      }

      return 0;
    }

    function buildRiskPenalty(roleProfile, threat) {
      return threat
        ? threat.totalDamage * roleProfile.safetyBias + threat.threatCount * 12
        : 0;
    }

    function pushReason(reasons, label, score) {
      if (!label || !Number.isFinite(score) || score === 0) {
        return;
      }

      reasons.push({ label, score });
    }

    function finalizeReasonLabels(reasons) {
      return reasons
        .sort((left, right) => Math.abs(right.score) - Math.abs(left.score))
        .slice(0, 3)
        .map((entry) => entry.label);
    }

    function buildAttackCandidate(snapshot, actor, currentOrigin, origin, target, roleProfile, threatCache, options) {
      const nextOptions = options || {};
      const skill = nextOptions.skill || null;
      const performance = skill ? hooks.SkillsService.getSkillPerformance(actor, skill) : null;
      const preview = getAttackPreview(snapshot, actor, origin, target, {
        damageType: skill && skill.effect ? skill.effect.damageType : null
      });

      if (!preview || !preview.canAttack) {
        return null;
      }

      const rawDamage = Math.max(0, Number(preview.damage || 0) + Number(performance && performance.kind === "attack" ? performance.damageBonus : 0));
      const hitRate = clamp(Number(preview.hitRate || 0) + Number(performance && performance.kind === "attack" ? performance.hitBonus : 0), 5, 100);
      const expectedDamage = Math.round(rawDamage * hitRate / 100);
      const willKill = rawDamage >= Number(target.hp || 0);
      const counterPreview = skill
        ? { canCounter: false, damage: 0 }
        : getCounterPreview(snapshot, actor, origin, target);
      const threat = estimateIncomingThreat(snapshot, actor, origin, threatCache, {
        ignoreEnemyIds: willKill ? [target.id] : []
      });
      const currentThreat = estimateIncomingThreat(snapshot, actor, currentOrigin, threatCache);
      const reasons = [];
      const damageScore = expectedDamage * 4 * roleProfile.aggression;
      const killBonus = willKill
        ? (target.isElite || target.isBoss ? 130 : isHealerOrRangedUnit(target) ? 120 : 100)
        : 0;
      const focusFireScore = getState().reservedTargets[target.id]
        ? (willKill ? 35 : 20) * roleProfile.focusBias
        : 0;
      const positioningScore = buildPositioningScore(snapshot, currentOrigin, origin, roleProfile, currentThreat, threat);
      const safetyScore = buildSafetyScore(actor, threat);
      const riskPenalty = buildRiskPenalty(roleProfile, threat);
      const overkillPenalty = Math.max(0, rawDamage - Number(target.hp || 0)) * 1.5;
      let score = damageScore + killBonus + focusFireScore + positioningScore + safetyScore - riskPenalty - overkillPenalty;

      if (!counterPreview.canCounter || willKill) {
        score += 18;
        pushReason(reasons, "noCounter", 18);
      } else if (Number(counterPreview.damage || 0) >= Number(actor.hp || 0)) {
        score -= 40;
        pushReason(reasons, "lethalCounter", -40);
      } else if (Number(counterPreview.damage || 0) >= Number(actor.maxHp || 0) * 0.35) {
        score -= 20;
        pushReason(reasons, "heavyCounter", -20);
      }

      if (killBonus > 0) {
        pushReason(reasons, "killBonus", killBonus);
      }

      if (focusFireScore > 0) {
        pushReason(reasons, "focusFire", focusFireScore);
      }

      if (positioningScore > 0) {
        pushReason(reasons, "safeTile", positioningScore);
      }

      if (safetyScore !== 0) {
        pushReason(reasons, safetyScore > 0 ? "survivable" : "danger", safetyScore);
      }

      if (skill && skill.effect && skill.effect.kind === "attack") {
        score += 8;
        pushReason(reasons, "skillValue", 8);
      }

      return {
        actorId: actor.id,
        type: skill ? (origin.x === actor.x && origin.y === actor.y ? "skill-attack-now" : "move-and-skill") : (origin.x === actor.x && origin.y === actor.y ? "attack-now" : "move-and-attack"),
        moveTo: origin.x === actor.x && origin.y === actor.y ? null : { x: origin.x, y: origin.y },
        targetId: target.id,
        skillId: skill ? skill.id : null,
        score,
        plannedVersion: getState().planVersion,
        reasons: finalizeReasonLabels(reasons)
      };
    }

    function buildHealCandidate(snapshot, actor, currentOrigin, origin, target, roleProfile, skill, threatCache) {
      const performance = hooks.SkillsService.getSkillPerformance(actor, skill);

      if (!performance || performance.kind !== "heal") {
        return null;
      }

      const effectiveHeal = Math.min(Number(performance.amount || 0), Math.max(0, Number(target.maxHp || 0) - Number(target.hp || 0)));

      if (effectiveHeal <= 0) {
        return null;
      }

      const targetThreat = estimateIncomingThreat(snapshot, target, { x: target.x, y: target.y }, getThreatCacheForActor(snapshot, target));
      const selfThreat = estimateIncomingThreat(snapshot, actor, origin, threatCache);
      const currentThreat = estimateIncomingThreat(snapshot, actor, currentOrigin, threatCache);
      const overhealPenalty = Math.max(0, Number(performance.amount || 0) - effectiveHeal);
      const imminentDeathBonus = targetThreat.isLethal ? 70 : 0;
      const coreUnitBonus = isCoreUnit(snapshot, target) ? 20 : 0;
      const healScore = effectiveHeal * 3 * roleProfile.healBias + imminentDeathBonus + coreUnitBonus - overhealPenalty;
      const positioningScore = buildPositioningScore(snapshot, currentOrigin, origin, roleProfile, currentThreat, selfThreat);
      const safetyScore = buildSafetyScore(actor, selfThreat);
      const riskPenalty = buildRiskPenalty(roleProfile, selfThreat);
      const reasons = [];
      const score = healScore + positioningScore + safetyScore - riskPenalty;

      pushReason(reasons, "healValue", healScore);
      if (imminentDeathBonus > 0) {
        pushReason(reasons, "rescue", imminentDeathBonus);
      }
      if (coreUnitBonus > 0) {
        pushReason(reasons, "coreUnit", coreUnitBonus);
      }
      if (positioningScore > 0) {
        pushReason(reasons, "safeTile", positioningScore);
      }

      return {
        actorId: actor.id,
        type: origin.x === actor.x && origin.y === actor.y ? "heal-now" : "move-and-heal",
        moveTo: origin.x === actor.x && origin.y === actor.y ? null : { x: origin.x, y: origin.y },
        targetId: target.id,
        skillId: skill.id,
        score,
        plannedVersion: getState().planVersion,
        reasons: finalizeReasonLabels(reasons)
      };
    }

    function buildMoveOnlyCandidate(snapshot, actor, currentOrigin, origin, roleProfile, threatCache) {
      if (origin.x === actor.x && origin.y === actor.y) {
        return null;
      }

      const currentThreat = estimateIncomingThreat(snapshot, actor, currentOrigin, threatCache);
      const nextThreat = estimateIncomingThreat(snapshot, actor, origin, threatCache);
      const currentApproach = getApproachMetrics(snapshot, actor, currentOrigin);
      const nextApproach = getApproachMetrics(snapshot, actor, origin);
      const hpRatio = Number(actor.hp || 0) / Math.max(1, Number(actor.maxHp || 1));

      if (nextThreat.isLethal || (nextThreat.threatCount >= 3 && hpRatio < 0.5)) {
        return null;
      }

      const positioningScore = buildPositioningScore(snapshot, currentOrigin, origin, roleProfile, currentThreat, nextThreat);
      const safetyScore = buildSafetyScore(actor, nextThreat);
      const distanceGain = Math.max(0, Number(currentApproach.distance || 0) - Number(nextApproach.distance || 0));
      const attackWindowGain = Math.max(0, Number(currentApproach.tilesToAttack || 0) - Number(nextApproach.tilesToAttack || 0));
      let utilityScore = distanceGain * 8 * roleProfile.objectiveBias + attackWindowGain * 10 * roleProfile.objectiveBias;
      const riskPenalty = nextThreat
        ? nextThreat.totalDamage * roleProfile.safetyBias * 0.55 + nextThreat.threatCount * 5
        : 0;
      const reasons = [];

      if (nextApproach.canAttackNextTurn && !currentApproach.canAttackNextTurn) {
        utilityScore += 24 * roleProfile.objectiveBias;
        pushReason(reasons, "nextTurnPressure", 24 * roleProfile.objectiveBias);
      }

      if (nextApproach.target && isHealerOrRangedUnit(nextApproach.target)) {
        utilityScore += 6 * roleProfile.objectiveBias;
        pushReason(reasons, "priorityTarget", 6 * roleProfile.objectiveBias);
      }

      const score = positioningScore + safetyScore + utilityScore - riskPenalty - Number(origin.cost || 0) * 0.6;

      if (positioningScore > 0) {
        pushReason(reasons, "safeTile", positioningScore);
      }

      if (utilityScore > 0) {
        pushReason(reasons, "advance", utilityScore);
      }

      return {
        actorId: actor.id,
        type: "move-only",
        moveTo: { x: origin.x, y: origin.y },
        targetId: null,
        skillId: null,
        score,
        approachScore: utilityScore,
        plannedVersion: getState().planVersion,
        reasons: finalizeReasonLabels(reasons)
      };
    }

    function buildWaitCandidate(snapshot, actor, roleProfile, threatCache) {
      const origin = { x: actor.x, y: actor.y };
      const threat = estimateIncomingThreat(snapshot, actor, origin, threatCache);
      const approach = getApproachMetrics(snapshot, actor, origin);
      const terrain = hooks.CombatService.getTerrainModifier(hooks.getMapTileType(snapshot, origin.x, origin.y));
      const safetyScore = buildSafetyScore(actor, threat);
      const riskPenalty = buildRiskPenalty(roleProfile, threat);
      const idlePenalty = !threat.isLethal && Number(approach.tilesToAttack || 0) > 0
        ? Math.min(22, Number(approach.tilesToAttack || 0) * 4 * Math.max(0.7, roleProfile.objectiveBias))
        : 0;
      const score = terrain.defense * 6 + safetyScore - riskPenalty + (threat.threatCount === 0 ? 4 : 0) - idlePenalty;
      const reasons = [];

      if (terrain.defense > 0) {
        pushReason(reasons, "holdTerrain", terrain.defense * 6);
      }

      if (safetyScore !== 0) {
        pushReason(reasons, safetyScore > 0 ? "survivable" : "danger", safetyScore);
      }

      if (idlePenalty > 0) {
        pushReason(reasons, "idle", -idlePenalty);
      }

      return {
        actorId: actor.id,
        type: "wait",
        moveTo: null,
        targetId: null,
        skillId: null,
        score,
        plannedVersion: getState().planVersion,
        reasons: finalizeReasonLabels(reasons)
      };
    }

    function choosePreferredCandidate(candidates) {
      const sorted = (candidates || [])
        .filter(Boolean)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          if (left.type === "wait" && right.type !== "wait") {
            return 1;
          }

          if (right.type === "wait" && left.type !== "wait") {
            return -1;
          }

          return 0;
        });
      const bestCandidate = sorted[0] || null;

      if (!bestCandidate || bestCandidate.type !== "wait") {
        return bestCandidate;
      }

      const bestAdvance = sorted.find((candidate) =>
        candidate.type === "move-only"
        && Number(candidate.approachScore || 0) > 0
      );

      if (!bestAdvance) {
        return bestCandidate;
      }

      if (bestAdvance.score >= bestCandidate.score - 14 || Number(bestAdvance.approachScore || 0) >= 20) {
        return bestAdvance;
      }

      return bestCandidate;
    }

    function buildBestActionForUnit(snapshot, actor) {
      const roleProfile = getRoleProfile(actor);
      const origins = buildReachableTiles(snapshot, actor, {
        allowOccupiedOrigin: true,
        movementLimit: Number(actor.mov || 0)
      });
      const threatCache = getThreatCacheForActor(snapshot, actor);
      const candidates = [];
      const currentOrigin = { x: actor.x, y: actor.y };
      const skills = hooks.BattleService.getActiveSkills(actor).filter((skill) => Number(skill.cooldownRemaining || 0) <= 0);

      origins.forEach((origin) => {
        collectAttackTargets(snapshot, actor, origin).forEach((target) => {
          const candidate = buildAttackCandidate(snapshot, actor, currentOrigin, origin, target, roleProfile, threatCache);

          if (candidate) {
            candidates.push(candidate);
          }
        });

        skills.forEach((skill) => {
          if (!canUseSkillAtOrigin(snapshot, origin, skill)) {
            return;
          }

          collectSkillTargets(snapshot, actor, origin, skill).forEach((target) => {
            const effectKind = skill.effect && skill.effect.kind;
            const candidate = effectKind === "heal"
              ? buildHealCandidate(snapshot, actor, currentOrigin, origin, target, roleProfile, skill, threatCache)
              : effectKind === "attack"
                ? buildAttackCandidate(snapshot, actor, currentOrigin, origin, target, roleProfile, threatCache, { skill })
                : null;

            if (candidate) {
              candidates.push(candidate);
            }
          });
        });

        const moveCandidate = buildMoveOnlyCandidate(snapshot, actor, currentOrigin, origin, roleProfile, threatCache);

        if (moveCandidate) {
          candidates.push(moveCandidate);
        }
      });

      candidates.push(buildWaitCandidate(snapshot, actor, roleProfile, threatCache));
      return choosePreferredCandidate(candidates);
    }

    function buildPlan(snapshot) {
      const readyAllies = (snapshot.battle.units || []).filter((unit) => unit.team === "ally" && unit.alive && !unit.acted);

      if (!readyAllies.length) {
        return {
          type: "end-turn",
          score: 0,
          reasons: ["turnComplete"]
        };
      }

      return readyAllies
        .map((unit) => buildBestActionForUnit(snapshot, unit))
        .filter(Boolean)
        .sort((left, right) => right.score - left.score)[0] || null;
    }

    function logDecision(candidate) {
      if (!candidate) {
        return;
      }

      const reasonText = Array.isArray(candidate.reasons) ? candidate.reasons.join(",") : "";
      console.debug(`[AUTO] actor=${candidate.actorId} action=${candidate.type} target=${candidate.targetId || "-"} score=${Math.round(candidate.score || 0)} reasons=${reasonText}`);
    }

    async function executePlan(candidate) {
      const viewState = getViewState();
      const snapshot = viewState.snapshot;

      if (!snapshot || !snapshot.battle || !candidate) {
        return;
      }

      if (candidate.type === "end-turn") {
        await hooks.executeEndTurnFlow();
        return;
      }

      const actor = snapshot.battle.units.find((unit) => unit.id === candidate.actorId && unit.alive && !unit.acted);

      if (!actor) {
        throw new Error("자동전투 대상 유닛을 찾을 수 없습니다.");
      }

      hooks.BattleService.selectUnit(actor.id);

      if (candidate.moveTo && (actor.x !== candidate.moveTo.x || actor.y !== candidate.moveTo.y)) {
        hooks.BattleService.handleTileSelection(candidate.moveTo.x, candidate.moveTo.y);
        hooks.BattleService.commitMovePreview();
      }

      if (candidate.skillId) {
        hooks.BattleService.setPendingSkill(candidate.skillId);
        const liveSnapshot = getViewState().snapshot;

        if (liveSnapshot && liveSnapshot.ui && liveSnapshot.ui.pendingSkillId && candidate.targetId) {
          const target = liveSnapshot.battle ? liveSnapshot.battle.units.find((unit) => unit.id === candidate.targetId && unit.alive) : null;

          if (!target) {
            throw new Error("자동전투 스킬 대상이 사라졌습니다.");
          }

          hooks.BattleService.handleTileSelection(target.x, target.y);
        }
        return;
      }

      if (candidate.type === "attack-now" || candidate.type === "move-and-attack") {
        const liveSnapshot = getViewState().snapshot;
        const target = liveSnapshot && liveSnapshot.battle ? liveSnapshot.battle.units.find((unit) => unit.id === candidate.targetId && unit.alive) : null;

        if (!target) {
          throw new Error("자동전투 공격 대상이 사라졌습니다.");
        }

        hooks.BattleService.setPendingAttack();
        hooks.BattleService.handleTileSelection(target.x, target.y);
        return;
      }

      if (candidate.type === "move-only" || candidate.type === "wait") {
        hooks.BattleService.waitSelectedUnit();
      }
    }

    async function tryRunStep() {
      const viewState = getViewState();
      const snapshot = viewState.snapshot;
      const autoBattle = getState();
      const gate = getGate(snapshot);

      autoBattle.suspendReason = gate.reason;
      clearTimer();

      if (!gate.canRun) {
        if (snapshot) {
          hooks.renderToolbar(snapshot);
        }
        return;
      }

      autoBattle.running = true;
      autoBattle.suspendReason = null;
      hooks.renderToolbar(snapshot);

      try {
        const candidate = buildPlan(snapshot);

        if (!candidate) {
          await hooks.executeEndTurnFlow();
          return;
        }

        logDecision(candidate);
        await executePlan(candidate);
        autoBattle.lastActorId = candidate.actorId || null;
        autoBattle.lastActionSummary = {
          type: candidate.type,
          targetId: candidate.targetId || null,
          score: candidate.score || 0
        };

        if (candidate.targetId) {
          autoBattle.reservedTargets[candidate.targetId] = candidate.actorId;
        }

        if (candidate.moveTo) {
          autoBattle.reservedTiles[`${candidate.moveTo.x},${candidate.moveTo.y}`] = candidate.actorId;
        }

        autoBattle.stepRetryCount = 0;
      } catch (error) {
        autoBattle.stepRetryCount += 1;
        autoBattle.suspendReason = "error";

        if (autoBattle.stepRetryCount > 2) {
          setEnabled(false, { reason: "error" });
          if (viewState.config && typeof viewState.config.showToast === "function") {
            viewState.config.showToast(error.message || "자동전투 진행 중 오류가 발생했습니다.", true);
          }
          return;
        }
      } finally {
        autoBattle.running = false;
        if (getViewState().snapshot) {
          hooks.renderToolbar(getViewState().snapshot);
        }
      }

      maybeSchedule(getViewState().snapshot, 120);
    }

    return {
      clearTimer,
      resetReservations,
      getButtonState,
      persistPreference,
      setEnabled,
      handleToggle,
      requestCancel,
      getGate,
      maybeSchedule,
      handleSnapshot,
      tryRunStep
    };
  }

  global.BattleAuto = {
    createState,
    createController
  };
})(window);
