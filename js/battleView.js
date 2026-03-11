/* 역할: 전투 화면 렌더링, 탑다운 전술 맵, 인벤토리/스탯 UI, 전투 입력 이벤트를 담당한다. */

(function attachBattleView(global) {
  const BattleService = global.BattleService;
  const CombatService = global.CombatService;
  const InventoryService = global.InventoryService;
  const SkillsService = global.SkillsService;
  const StatsService = global.StatsService;

  const viewState = {
    config: null,
    snapshot: null,
    sessionRef: null,
    aiRunning: false,
    statusAnnounced: null,
    statusOverlayKey: null,
    modal: null,
    audioContext: null,
    scenePulseTimer: null,
    overlayTimer: null,
    cutInTimer: null,
    centeredBattleId: null,
    progressionDrafts: {},
    panState: {
      active: false,
      startClientX: 0,
      startClientY: 0,
      startScrollLeft: 0,
      startScrollTop: 0
    }
  };

  function isTextInputElement(target) {
    if (!target) {
      return false;
    }

    const tagName = String(target.tagName || "").toUpperCase();
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function resolveStaticAssetPath(relativePath) {
    try {
      return new URL(relativePath, document.baseURI).toString();
    } catch (error) {
      return relativePath;
    }
  }

  function formatRewardItemLabel(item) {
    if (!item) {
      return "";
    }

    const displayName = InventoryService.getItemDisplayName(item, {
      forceShowReinforceLevel: InventoryService.isWeapon(item)
    });

    if (InventoryService.isMisc(item)) {
      return `${displayName} x${Math.max(0, Number(item.quantity || 0))}`;
    }

    return displayName;
  }

  function getBaseClassName(className) {
    const normalizedClassName = String(className || "").trim();

    if (!normalizedClassName) {
      return "";
    }

    const promotionTree = SkillsService.PROMOTION_TREE || {};
    const reversePromotionMap = new Map();

    Object.keys(promotionTree).forEach((sourceClassName) => {
      (promotionTree[sourceClassName] || []).forEach((promotion) => {
        if (promotion && promotion.className) {
          reversePromotionMap.set(promotion.className, sourceClassName);
        }
      });
    });

    let currentClassName = normalizedClassName;
    const visited = new Set();

    while (reversePromotionMap.has(currentClassName) && !visited.has(currentClassName)) {
      visited.add(currentClassName);
      currentClassName = reversePromotionMap.get(currentClassName) || currentClassName;
    }

    return currentClassName;
  }

  function getClassIconPath(unit) {
    const baseClassName = getBaseClassName(unit && unit.className);
    const iconByBaseClass = {
      로드: resolveStaticAssetPath("./icons/lord.png"),
      검사: resolveStaticAssetPath("./icons/swordman.png"),
      랜서: resolveStaticAssetPath("./icons/lancer.png"),
      솔저: resolveStaticAssetPath("./icons/soldier.png"),
      아처: resolveStaticAssetPath("./icons/archer.png"),
      헌터: resolveStaticAssetPath("./icons/hunter.png"),
      브리건드: resolveStaticAssetPath("./icons/brigand.png"),
      클레릭: resolveStaticAssetPath("./icons/cleric.png"),
      메이지: resolveStaticAssetPath("./icons/magician.png")
    };

    return iconByBaseClass[baseClassName] || "";
  }

  function buildUnitIdentityMarkup(unit, subtitle) {
    const iconPath = getClassIconPath(unit);
    const unitName = `${unit.name}${unit.isBoss ? " ★" : unit.isElite ? " ◆" : ""}`;
    const subtitleText = subtitle || "";

    if (!iconPath) {
      return [
        '<div class="unit-identity-row">',
        '  <div class="unit-identity-copy">',
        `    <strong>${unitName}</strong>`,
        subtitleText ? `    <div class="unit-identity-subtitle">${subtitleText}</div>` : "",
        "  </div>",
        "</div>"
      ].filter(Boolean).join("");
    }

    const altText = `${getBaseClassName(unit.className)} 아이콘`;
    return [
      '<div class="unit-identity-row">',
      '  <div class="unit-identity-copy">',
      `    <strong>${unitName}</strong>`,
      subtitleText ? `    <div class="unit-identity-subtitle">${subtitleText}</div>` : "",
      "  </div>",
      `  <img class="unit-class-icon" src="${iconPath}" alt="${escapeAttribute(altText)}">`,
      "</div>"
    ].filter(Boolean).join("");
  }

  function getTileDisplayName(unit) {
    if (!unit) {
      return "";
    }

    const prefix = unit.variant && unit.variant.prefix
      ? `${unit.variant.prefix} `
      : "";

    if (prefix && String(unit.name || "").startsWith(prefix)) {
      return String(unit.name || "").slice(prefix.length);
    }

    return String(unit.name || "");
  }

  function buildPrimaryStatMetaPill(statName, value, previewDelta) {
    const label = StatsService.PRIMARY_STAT_LABELS[statName];
    const draftValue = Number(previewDelta || 0);
    return `<span class="meta-pill stat-tooltip-pill ${draftValue > 0 ? "is-preview-up" : ""}" data-stat-tooltip="${escapeAttribute(StatsService.getPrimaryStatDescription(statName))}">${label} ${value}${draftValue > 0 ? ` (+${draftValue})` : ""}</span>`;
  }

  function createEmptyProgressionDraft() {
    return {
      stats: {
        str: 0,
        dex: 0,
        vit: 0,
        int: 0,
        luk: 0
      },
      skillIds: []
    };
  }

  function getProgressionDraft(unitId) {
    if (!viewState.progressionDrafts[unitId]) {
      viewState.progressionDrafts[unitId] = createEmptyProgressionDraft();
    }

    return viewState.progressionDrafts[unitId];
  }

  function clearProgressionDraft(unitId) {
    delete viewState.progressionDrafts[unitId];
  }

  function countDraftStats(draft) {
    return StatsService.PRIMARY_STATS.reduce((sum, statName) => sum + Number((draft.stats && draft.stats[statName]) || 0), 0);
  }

  function countDraftSkills(draft) {
    return Array.isArray(draft.skillIds) ? draft.skillIds.length : 0;
  }

  function init(config) {
    viewState.config = config;
    ensureBattleLayout();
    bindStaticEvents();
    BattleService.subscribe(handleSnapshot);
  }

  function ensureBattleLayout() {
    const mapRoot = getElement("battle-map-root");

    mapRoot.innerHTML = [
      '<div class="battle-toolbar">',
      '  <div class="camera-controls">',
      '    <span class="meta-pill is-cyan">탑다운 고정 시점</span>',
      '    <span class="meta-pill">랜덤 던전 보드</span>',
      "  </div>",
      '  <div id="battle-turn-counter" class="battle-turn-counter">TURN 1</div>',
      '  <div class="battle-toolbar-actions">',
      '    <button id="battle-stage-info-button" class="ghost-button" type="button">스테이지 정보</button>',
      '    <button id="battle-end-turn-button" class="secondary-button" type="button">턴 종료</button>',
      '    <button id="battle-return-menu-button" class="ghost-button" type="button">메뉴로</button>',
      "  </div>",
      "</div>",
      '<div id="battle-status-banner" class="battle-status-banner hidden"></div>',
      '<div id="battle-flavor-ribbon" class="battle-flavor-ribbon hidden"></div>',
      '<div id="battle-scene" class="battle-scene">',
      '  <div id="battle-cutin" class="battle-cutin hidden">',
      '    <div class="battle-cutin-panel">',
      '      <span id="battle-cutin-eyebrow" class="battle-cutin-eyebrow"></span>',
      '      <strong id="battle-cutin-title" class="battle-cutin-title"></strong>',
      '      <span id="battle-cutin-subtitle" class="battle-cutin-subtitle"></span>',
      "    </div>",
      "  </div>",
      '  <div id="battle-overlay-effect" class="battle-overlay-effect hidden"></div>',
      '  <div id="battle-hover-preview" class="battle-hover-preview hidden"></div>',
      '  <div id="battle-camera" class="battle-camera">',
      '    <div id="battle-grid" class="battle-grid"></div>',
      "  </div>",
      "</div>"
    ].join("");

    const battleScreen = getElement("screen-battle");
    const modalHost = document.createElement("div");
    modalHost.id = "battle-modal-host";
    battleScreen.appendChild(modalHost);
  }

  function bindStaticEvents() {
    const scene = getElement("battle-scene");

    getElement("battle-stage-info-button").addEventListener("click", openBattleInfoModal);
    getElement("battle-end-turn-button").addEventListener("click", handleEndTurn);
    getElement("battle-return-menu-button").addEventListener("click", handleReturnMenu);
    scene.addEventListener("mousedown", handleScenePointerDown);
    scene.addEventListener("contextmenu", handleSceneContextMenu);

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("mousemove", handleScenePointerMove);
    document.addEventListener("mouseup", handleScenePointerUp);
  }

  function handleSnapshot(snapshot) {
    const previousSnapshot = viewState.snapshot;
    viewState.snapshot = snapshot;

    if (snapshot.active && snapshot.saveData) {
      if (viewState.sessionRef) {
        viewState.sessionRef.saveData = snapshot.saveData;
      }

      persistSession(snapshot.saveData, getLiveSession().settings || snapshot.settings);
    }

    processSnapshotEffects(previousSnapshot, snapshot);
    render(snapshot);
    maybeShowCutscene(snapshot);
    maybeShowPrologueTutorial(snapshot);
    maybeShowSupportChoice(snapshot);
    maybeAnnounceStatus(snapshot);
  }

  function ensureAudioContext() {
    const AudioContextCtor = global.AudioContext || global.webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    if (!viewState.audioContext) {
      viewState.audioContext = new AudioContextCtor();
    }

    if (viewState.audioContext.state === "suspended") {
      viewState.audioContext.resume().catch(() => {});
    }

    return viewState.audioContext;
  }

  function playUiTone(type, terrainType) {
    const context = ensureAudioContext();

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const presets = {
      hit: { frequency: 180, endFrequency: 120, duration: 0.1, wave: "square", volume: 0.05 },
      heal: { frequency: 520, endFrequency: 640, duration: 0.16, wave: "sine", volume: 0.045 },
      buff: { frequency: 340, endFrequency: 420, duration: 0.14, wave: "triangle", volume: 0.04 },
      loot: { frequency: 680, endFrequency: 860, duration: 0.18, wave: "triangle", volume: 0.045 },
      victory: { frequency: 540, endFrequency: 820, duration: 0.26, wave: "sine", volume: 0.055 },
      defeat: { frequency: 220, endFrequency: 130, duration: 0.28, wave: "sawtooth", volume: 0.05 }
    };
    const preset = Object.assign({}, presets[type] || presets.hit);
    const terrainTuning = {
      forest: { frequencyScale: 0.92, endScale: 0.9, volumeScale: 0.95 },
      hill: { frequencyScale: 1.12, endScale: 1.08, volumeScale: 1.04 },
      marsh: { frequencyScale: 0.84, endScale: 0.82, volumeScale: 0.9 },
      ruin: { frequencyScale: 1.04, endScale: 1.02, volumeScale: 1.06 },
      wall: { frequencyScale: 0.78, endScale: 0.76, volumeScale: 1.08 }
    };
    const tuning = terrainTuning[terrainType] || { frequencyScale: 1, endScale: 1, volumeScale: 1 };

    oscillator.type = preset.wave;
    oscillator.frequency.setValueAtTime(preset.frequency * tuning.frequencyScale, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, preset.endFrequency * tuning.endScale), now + preset.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.volume * tuning.volumeScale, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
  }

  function getTerrainLabel(tileType) {
    return tileType === "forest"
      ? "숲"
      : tileType === "hill"
        ? "고지"
        : tileType === "marsh"
          ? "습지"
          : tileType === "ruin"
            ? "폐허"
            : tileType === "wall"
              ? "벽"
              : "평지";
  }

  function shouldDisplayTileMarker(snapshot, marker) {
    if (!snapshot || !snapshot.battle || !marker) {
      return false;
    }

    if (!snapshot.battle.cutsceneSeen) {
      return true;
    }

    return marker.type === "npc" || marker.type === "site";
  }

  function formatMoveCost(moveCost) {
    return moveCost === Infinity ? "이동 불가" : `${moveCost}`;
  }

  function pulseBattleScene(effectType, label) {
    const scene = getElement("battle-scene");
    const overlay = getElement("battle-overlay-effect");

    if (!scene || !overlay) {
      return;
    }

    scene.classList.remove("pulse-hit", "pulse-heal", "pulse-buff", "pulse-victory", "pulse-defeat", "pulse-loot");
    void scene.offsetWidth;
    scene.classList.add(`pulse-${effectType}`);

    overlay.textContent = label || "";
    overlay.className = `battle-overlay-effect ${label ? "" : "hidden"} overlay-${effectType}`;

    if (viewState.scenePulseTimer) {
      global.clearTimeout(viewState.scenePulseTimer);
    }

    if (viewState.overlayTimer) {
      global.clearTimeout(viewState.overlayTimer);
    }

    viewState.scenePulseTimer = global.setTimeout(() => {
      scene.classList.remove("pulse-hit", "pulse-heal", "pulse-buff", "pulse-victory", "pulse-defeat", "pulse-loot");
    }, 340);

    viewState.overlayTimer = global.setTimeout(() => {
      overlay.className = "battle-overlay-effect hidden";
      overlay.textContent = "";
    }, 720);
  }

  function showBattleCutIn(theme, eyebrow, title, subtitle) {
    const cutIn = getElement("battle-cutin");
    const eyebrowNode = getElement("battle-cutin-eyebrow");
    const titleNode = getElement("battle-cutin-title");
    const subtitleNode = getElement("battle-cutin-subtitle");

    if (!cutIn || !eyebrowNode || !titleNode || !subtitleNode) {
      return;
    }

    cutIn.className = `battle-cutin theme-${theme || "boss"}`;
    eyebrowNode.textContent = eyebrow || "";
    titleNode.textContent = title || "";
    subtitleNode.textContent = subtitle || "";
    void cutIn.offsetWidth;
    cutIn.classList.add("is-active");

    if (viewState.cutInTimer) {
      global.clearTimeout(viewState.cutInTimer);
    }

    viewState.cutInTimer = global.setTimeout(() => {
      cutIn.className = "battle-cutin hidden";
      eyebrowNode.textContent = "";
      titleNode.textContent = "";
      subtitleNode.textContent = "";
    }, 1450);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compactBattleInfoText(text, maxLength) {
    if (!text) {
      return "-";
    }

    const normalized = String(text).replace(/\s+/g, " ").trim();
    const sentence = normalized.split(/[.!?]/)[0].trim() || normalized;

    if (sentence.length <= maxLength) {
      return sentence;
    }

    return `${sentence.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function getBattleMatchupSummary(unit) {
    const classProfile = unit ? SkillsService.getClassProfile(unit) : null;
    return classProfile && classProfile.matchup
      ? classProfile.matchup
      : "강약 병종 정보 없음";
  }

  function buildBattleMatchupMarkup(unit) {
    const summary = getBattleMatchupSummary(unit);
    const matched = String(summary || "").match(/강:\s*([^/]+?)(?:\s*\/\s*약:\s*(.+))?$/);

    if (!matched) {
      return `<p><span>상성</span>${summary}</p>`;
    }

    const strengths = String(matched[1] || "").trim();
    const weaknesses = String(matched[2] || "").trim();

    return [
      '<div class="turn-info-matchup-block">',
      '  <span>상성</span>',
      strengths ? `  <div class="turn-info-matchup-line"><strong>강점 :</strong> ${strengths}</div>` : "",
      weaknesses ? `  <div class="turn-info-matchup-line"><strong>약점 :</strong> ${weaknesses}</div>` : "",
      "</div>"
    ].filter(Boolean).join("");
  }

  function getBattleCautionSummary(unit) {
    const weaponType = unit && unit.weapon ? unit.weapon.type : "";

    if (weaponType === "bow") {
      return "후열 딜러, 인접전 취약.";
    }

    if (weaponType === "focus") {
      return "지원형, 전열 뒤 유지.";
    }

    if (weaponType === "lance") {
      return "전열형, 길목 유지에 강함.";
    }

    if (weaponType === "axe") {
      return "근딜 선봉, 명중 기복 있음.";
    }

    if (weaponType === "sword") {
      return "근접 딜러, 원거리엔 약함.";
    }

    return "강한 거리만 유지하면 됨.";
  }

  function findSpecialActorFromLogs(logs, units) {
    const specialUnits = (units || []).filter((unit) => unit.isBoss || unit.isElite);

    for (let index = 0; index < logs.length; index += 1) {
      const entry = logs[index];

      for (let unitIndex = 0; unitIndex < specialUnits.length; unitIndex += 1) {
        const unit = specialUnits[unitIndex];
        const namePattern = new RegExp(`^${escapeRegExp(unit.name)}(?:의|\\s|->)`);

        if (namePattern.test(entry)) {
          return unit;
        }
      }
    }

    return null;
  }

  function findUnitByName(units, name) {
    return (units || []).find((unit) => unit.name === name) || null;
  }

  function getTerrainTypeAt(snapshot, x, y) {
    return snapshot && snapshot.battle && snapshot.battle.map && snapshot.battle.map.tiles[y]
      ? snapshot.battle.map.tiles[y][x]
      : "plain";
  }

  function getTerrainVariantFromLogs(logs, snapshot) {
    const joined = (logs || []).join(" ");
    const attackMatch = joined.match(/([^\s]+)\s->\s([^\s:]+)/);

    if (attackMatch) {
      const attacker = findUnitByName(snapshot.battle.units, attackMatch[1]);
      const defender = findUnitByName(snapshot.battle.units, attackMatch[2]);

      if (defender) {
        return getTerrainTypeAt(snapshot, defender.x, defender.y);
      }

      if (attacker) {
        return getTerrainTypeAt(snapshot, attacker.x, attacker.y);
      }
    }

    const moveMatch = joined.match(/([^\s]+)\s이동/);

    if (moveMatch) {
      const mover = findUnitByName(snapshot.battle.units, moveMatch[1]);

      if (mover) {
        return getTerrainTypeAt(snapshot, mover.x, mover.y);
      }
    }

    return "plain";
  }

  function processSnapshotEffects(previousSnapshot, nextSnapshot) {
    if (!nextSnapshot || !nextSnapshot.battle) {
      return;
    }

    if (!previousSnapshot || !previousSnapshot.battle) {
      const bossUnit = nextSnapshot.battle.bossUnitId
        ? nextSnapshot.battle.units.find((unit) => unit.id === nextSnapshot.battle.bossUnitId)
        : null;
      const firstElite = nextSnapshot.battle.units.find((unit) => unit.alive && unit.isElite);

      if (bossUnit && nextSnapshot.battle.status === "in_progress") {
        showBattleCutIn("boss", "Boss Encounter", bossUnit.name, bossUnit.bossTitle || "적 지휘 개체");
        playUiTone("buff");
      } else if (firstElite && nextSnapshot.battle.status === "in_progress") {
        showBattleCutIn("elite", "Elite Encounter", firstElite.name, `${firstElite.eliteTitle} / ${firstElite.eliteTraitName}`);
        playUiTone("buff");
      }

      return;
    }

    if (previousSnapshot.battle.status !== nextSnapshot.battle.status && nextSnapshot.battle.status !== "in_progress") {
      const isVictory = nextSnapshot.battle.status === "victory";
      playUiTone(isVictory ? "victory" : "defeat");
      pulseBattleScene(isVictory ? "victory" : "defeat", isVictory ? "VICTORY" : "DEFEAT");
      if (!isVictory) {
        showBattleCutIn("defeat", "Collapse", "전열 붕괴", "리더가 쓰러졌습니다");
      }
      return;
    }

    const previousLogLength = (previousSnapshot.battle.logs || []).length;
    const nextLogs = (nextSnapshot.battle.logs || []).slice(previousLogLength);
    const defeatedSpecialUnits = (previousSnapshot.battle.units || [])
      .filter((unit) => (unit.isBoss || unit.isElite) && unit.alive)
      .map((unit) => {
        const nextUnit = (nextSnapshot.battle.units || []).find((candidate) => candidate.id === unit.id);
        return nextUnit && !nextUnit.alive ? nextUnit : null;
      })
      .filter(Boolean);

    if (!nextLogs.length && !defeatedSpecialUnits.length) {
      return;
    }

    const joined = nextLogs.join(" ");
    const terrainVariant = getTerrainVariantFromLogs(nextLogs, nextSnapshot);
    const specialActor = findSpecialActorFromLogs(nextLogs, nextSnapshot.battle.units);

    if (/정예 반응 감지/.test(joined)) {
      const firstElite = nextSnapshot.battle.units.find((unit) => unit.alive && unit.isElite);

      if (firstElite) {
        showBattleCutIn("elite", "Elite Encounter", firstElite.name, `${firstElite.eliteTitle} / ${firstElite.eliteTraitName}`);
      }
    }

    if (/스킬 발동/.test(joined) && specialActor) {
      if (specialActor.isBoss) {
        showBattleCutIn("boss", "Boss Skill", specialActor.name, specialActor.bossTitle || "무한 균열 지배체");
      } else if (specialActor.isElite) {
        showBattleCutIn("elite", "Elite Skill", specialActor.name, `${specialActor.eliteTitle} / ${specialActor.eliteTraitName}`);
      }
    }

    if (defeatedSpecialUnits.length) {
      const defeated = defeatedSpecialUnits[0];
      showBattleCutIn(defeated.isBoss ? "boss-break" : "elite-break", defeated.isBoss ? "Boss Broken" : "Elite Broken", defeated.name, defeated.isBoss ? (defeated.bossTitle || "지휘 개체 격파") : `${defeated.eliteTitle} 붕괴`);
      playUiTone("loot");
    }

    if (/회복/.test(joined)) {
      playUiTone("heal", terrainVariant);
      pulseBattleScene("heal", "HEAL");
      return;
    }

    if (/부여|강화|전장 규칙|유물 획득/.test(joined)) {
      playUiTone(/유물 획득|전리품|아이템 획득/.test(joined) ? "loot" : "buff", terrainVariant);
      pulseBattleScene(/유물 획득|전리품|아이템 획득/.test(joined) ? "loot" : "buff", /유물 획득|전리품|아이템 획득/.test(joined) ? "LOOT" : "BUFF");
      return;
    }

    if (/이동:|\s이동/.test(joined)) {
      playUiTone("buff", terrainVariant);
      return;
    }

    if (/피해|격파|빗나갔습니다/.test(joined)) {
      playUiTone("hit", terrainVariant);
      pulseBattleScene("hit", /격파/.test(joined) ? "BREAK" : "HIT");
    }
  }

  function persistSession(saveData, settings) {
    if (viewState.config && typeof viewState.config.persistSession === "function") {
      viewState.config.persistSession(saveData, settings);
    }
  }

  function startNewBattle(session) {
    if (!session || !session.userId) {
      throw new Error("전투를 시작할 사용자 세션이 없습니다.");
    }

    viewState.sessionRef = session;
    viewState.aiRunning = false;
    viewState.statusAnnounced = null;
    viewState.progressionDrafts = {};
    BattleService.launch({
      userId: session.userId,
      saveData: session.saveData,
      settings: session.settings,
      resume: false
    });
    viewState.config.showScreen("screen-battle");
  }

  function resumeBattle(session) {
    if (!session || !session.userId) {
      throw new Error("이어할 전투 세션이 없습니다.");
    }

    viewState.sessionRef = session;
    viewState.aiRunning = false;
    viewState.statusAnnounced = null;
    viewState.progressionDrafts = {};
    BattleService.launch({
      userId: session.userId,
      saveData: session.saveData,
      settings: session.settings,
      resume: true
    });
    viewState.config.showScreen("screen-battle");
  }

  function handleKeydown(event) {
    if (!getElement("screen-battle").classList.contains("active")) {
      return;
    }

    if (isTextInputElement(event.target)) {
      return;
    }

    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (viewState.modal) {
      if (
        (event.key === "a" || event.key === "A" || event.key === "s" || event.key === "S")
        && event.target
      ) {
        event.preventDefault();
      }

      if (
        viewState.modal.dataset.spaceConfirmAction === "wait-selected-unit"
        || viewState.modal.dataset.spaceConfirmAction === "end-player-turn"
      ) {
        if (event.code === "Space" || event.key === " ") {
          event.preventDefault();
          const confirmButton = viewState.modal.querySelector("[data-space-confirm='true']");

          if (confirmButton) {
            confirmButton.click();
          }
        }
      }

      return;
    }

    if (!viewState.snapshot) {
      return;
    }

    const selectedUnit = getSelectedUnit(viewState.snapshot);
    const movePreview = viewState.snapshot.ui.movePreview;
    const pendingMove = viewState.snapshot.ui.pendingMove
      || (selectedUnit && selectedUnit.turnMoveCommit)
      || null;
    const canControlUnit = !!(
      selectedUnit
      && selectedUnit.team === "ally"
      && selectedUnit.alive
      && !selectedUnit.acted
      && viewState.snapshot.battle
      && viewState.snapshot.battle.phase === "player"
    );
    const normalizedKey = String(event.key || "").toLowerCase();

    if (normalizedKey === "a" || normalizedKey === "s") {
      if (!canControlUnit || (movePreview && movePreview.unitId === selectedUnit.id)) {
        return;
      }

      event.preventDefault();

      if (normalizedKey === "a") {
        handleUnitAction("attack");
        return;
      }

      handleUnitAction("skill");
      return;
    }

    if (event.code !== "Space" && event.key !== " ") {
      return;
    }

    if (shouldOfferSpaceEndTurn(viewState.snapshot)) {
      event.preventDefault();
      openEndTurnConfirmModal();
      return;
    }

    if (!canControlUnit || viewState.snapshot.ui.pendingAttack || viewState.snapshot.ui.pendingSkillId) {
      return;
    }

    event.preventDefault();

    if (movePreview && movePreview.unitId === selectedUnit.id) {
      try {
        BattleService.commitMovePreview();
      } catch (error) {
        viewState.config.showToast(error.message, true);
      }
      return;
    }

    if (pendingMove && pendingMove.unitId === selectedUnit.id) {
      openWaitConfirmModal(selectedUnit);
    }
  }

  function shouldOfferSpaceEndTurn(snapshot) {
    if (!snapshot || !snapshot.battle || viewState.aiRunning) {
      return false;
    }

    if (snapshot.battle.phase !== "player" || snapshot.battle.victoryCondition === "support_complete") {
      return false;
    }

    if (snapshot.ui.pendingAttack || snapshot.ui.pendingSkillId || snapshot.ui.movePreview || snapshot.ui.pendingMove) {
      return false;
    }

    return !snapshot.battle.units.some((unit) => unit.team === "ally" && unit.alive && !unit.acted);
  }

  function openWaitConfirmModal(unit) {
    if (!unit) {
      return;
    }

    const body = [
      `<h3>${unit.name} 행동 확정</h3>`,
      '<div class="modal-list">',
      '<article class="modal-card">',
      `  <p class="wait-confirm-copy">${unit.name}의 이동을 확정했고 더 이상 행동하지 않도록 종료할까요?</p>`,
      '  <p class="action-hint">스페이스바를 한 번 더 누르면 바로 확정됩니다.</p>',
      '  <div class="button-row">',
      '    <button class="primary-button small-button" type="button" data-space-confirm="true" data-confirm-wait="true">행동 확정</button>',
      '    <button class="ghost-button small-button" type="button" data-cancel-wait="true">취소</button>',
      "  </div>",
      "</article>",
      "</div>"
    ].join("");

    showModal(body, {
      panelClass: "battle-wait-confirm-panel",
      bodyClass: "battle-wait-confirm-body"
    });

    if (!viewState.modal) {
      return;
    }

    viewState.modal.dataset.spaceConfirmAction = "wait-selected-unit";
    const confirmButton = viewState.modal.querySelector("[data-confirm-wait='true']");
    const cancelButton = viewState.modal.querySelector("[data-cancel-wait='true']");

    if (confirmButton) {
      confirmButton.addEventListener("click", () => {
        closeModal();

        try {
          BattleService.waitSelectedUnit();
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    }

    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        closeModal();
      });
    }
  }

  function openEndTurnConfirmModal() {
    const snapshot = viewState.snapshot;

    if (!shouldOfferSpaceEndTurn(snapshot)) {
      return;
    }

    const body = [
      "<h3>턴 종료 확인</h3>",
      '<div class="modal-list">',
      '<article class="modal-card">',
      '  <p class="wait-confirm-copy">현재 아군 전원의 행동이 확정되었습니다. 턴을 종료하고 적 턴으로 넘길까요?</p>',
      '  <p class="action-hint">스페이스바를 한 번 더 누르면 바로 턴이 종료됩니다.</p>',
      '  <div class="button-row">',
      '    <button class="primary-button small-button" type="button" data-space-confirm="true" data-confirm-end-turn="true">턴 종료</button>',
      '    <button class="ghost-button small-button" type="button" data-cancel-end-turn="true">취소</button>',
      "  </div>",
      "</article>",
      "</div>"
    ].join("");

    showModal(body, {
      panelClass: "battle-wait-confirm-panel",
      bodyClass: "battle-wait-confirm-body"
    });

    if (!viewState.modal) {
      return;
    }

    viewState.modal.dataset.spaceConfirmAction = "end-player-turn";
    const confirmButton = viewState.modal.querySelector("[data-confirm-end-turn='true']");
    const cancelButton = viewState.modal.querySelector("[data-cancel-end-turn='true']");

    if (confirmButton) {
      confirmButton.addEventListener("click", async () => {
        closeModal();
        await executeEndTurnFlow();
      });
    }

    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        closeModal();
      });
    }
  }

  async function executeEndTurnFlow() {
    if (!viewState.snapshot || viewState.aiRunning || viewState.snapshot.battle.phase !== "player") {
      return;
    }

    viewState.aiRunning = true;

    try {
      BattleService.endPlayerTurn();
      await BattleService.runEnemyPhase();
    } catch (error) {
      viewState.config.showToast(error.message || "적 턴 진행 중 오류가 발생했습니다.", true);
    } finally {
      viewState.aiRunning = false;
    }
  }

  function handleScenePointerDown(event) {
    const scene = getElement("battle-scene");

    if (!scene || event.button !== 2) {
      return;
    }

    viewState.panState.active = true;
    viewState.panState.startClientX = event.clientX;
    viewState.panState.startClientY = event.clientY;
    viewState.panState.startScrollLeft = scene.scrollLeft;
    viewState.panState.startScrollTop = scene.scrollTop;
    scene.classList.add("is-panning");
    hideHoverPreview();
    clearMovePathPreview();
    event.preventDefault();
  }

  function handleScenePointerMove(event) {
    const scene = getElement("battle-scene");

    if (!scene || !viewState.panState.active) {
      return;
    }

    const deltaX = event.clientX - viewState.panState.startClientX;
    const deltaY = event.clientY - viewState.panState.startClientY;
    scene.scrollLeft = viewState.panState.startScrollLeft - deltaX;
    scene.scrollTop = viewState.panState.startScrollTop - deltaY;
    event.preventDefault();
  }

  function handleScenePointerUp(event) {
    if (event.button !== 2 || !viewState.panState.active) {
      return;
    }

    const scene = getElement("battle-scene");
    viewState.panState.active = false;

    if (scene) {
      scene.classList.remove("is-panning");
    }
  }

  function handleSceneContextMenu(event) {
    if (viewState.panState.active) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
  }

  function getLiveSession() {
    return viewState.sessionRef || viewState.config.getSession();
  }

  function render(snapshot) {
    renderTurnInfo(snapshot);
    renderSelectedUnitInfo(snapshot);
    renderFlavorRibbon(snapshot);
    renderLog(snapshot);
    renderMap(snapshot);
    renderStatusBanner(snapshot);
    renderToolbar(snapshot);
  }

  function formatFloorType(floorType) {
    if (floorType === "rest") {
      return "휴식층";
    }

    if (floorType === "supply") {
      return "보급층";
    }

    if (floorType === "shop") {
      return "상점층";
    }

    if (floorType === "relic") {
      return "유물층";
    }

    if (floorType === "event") {
      return "이벤트층";
    }

    if (floorType === "boss") {
      return "보스층";
    }

    return "전투층";
  }

  function getBattleBriefingContext(snapshot) {
    const alliesAlive = snapshot.battle.units.filter((unit) => unit.team === "ally" && unit.alive).length;
    const enemiesAlive = snapshot.battle.units.filter((unit) => unit.team === "enemy" && unit.alive).length;
    const eliteUnits = snapshot.battle.units.filter((unit) => unit.team === "enemy" && unit.alive && unit.isElite);
    const bossUnit = snapshot.battle.bossUnitId
      ? snapshot.battle.units.find((unit) => unit.id === snapshot.battle.bossUnitId)
      : null;
    const relicCount = (snapshot.saveData && snapshot.saveData.endless && snapshot.saveData.endless.relicIds || []).length;
    const endlessCurrentRun = snapshot.battle.stageId === "endless-rift" && snapshot.saveData
      ? BattleService.getEndlessCurrentRunSummary(snapshot.saveData)
      : null;
    const activeChain = endlessCurrentRun && endlessCurrentRun.chainState ? endlessCurrentRun.chainState : null;
    const leadCopy = snapshot.battle.specialRule
      ? snapshot.battle.specialRule.description
      : snapshot.battle.lastEventText || snapshot.battle.objective;

    return {
      alliesAlive,
      enemiesAlive,
      eliteUnits,
      bossUnit,
      relicCount,
      endlessCurrentRun,
      activeChain,
      leadCopy
    };
  }

  function buildBattleFlavorChips(snapshot, context) {
    const chips = [`<span class="flavor-chip floor">${formatFloorType(snapshot.battle.floorType)}</span>`];

    if (snapshot.battle.specialRule) {
      chips.push(`<span class="flavor-chip rule">${snapshot.battle.specialRule.name}</span>`);
    }

    if (context.eliteUnits.length) {
      chips.push(`<span class="flavor-chip elite">정예 ${context.eliteUnits.length}</span>`);
    }

    if (snapshot.battle.stageId === "endless-rift") {
      chips.push(`<span class="flavor-chip relic">유물 ${context.relicCount}</span>`);

      if (context.endlessCurrentRun) {
        chips.push(`<span class="flavor-chip run">처치 ${context.endlessCurrentRun.enemiesDefeated}</span>`);
      }

      if (context.activeChain) {
        chips.push(`<span class="flavor-chip chain">${context.activeChain.name}</span>`);
      }
    }

    return chips;
  }

  function buildBattleBriefingMetric(label, value, toneClass) {
    return [
      `<div class="battle-briefing-metric${toneClass ? ` is-${toneClass}` : ""}">`,
      `  <span class="battle-briefing-label">${label}</span>`,
      `  <strong class="battle-briefing-value">${value}</strong>`,
      "</div>"
    ].join("");
  }

  function buildBattleBriefingMarkup(snapshot, options) {
    const nextOptions = options || {};
    const context = getBattleBriefingContext(snapshot);
    const chips = buildBattleFlavorChips(snapshot, context);
    const progressText = BattleService.getVictoryProgressText();
    const bossText = context.bossUnit && context.bossUnit.alive
      ? `${context.bossUnit.name} ${context.bossUnit.hp}/${context.bossUnit.maxHp}`
      : "격파됨 또는 없음";
    const currentRunText = context.endlessCurrentRun
      ? `${context.endlessCurrentRun.floorsCleared}층 돌파 / 정예 ${context.endlessCurrentRun.eliteDefeated} / 피해 ${context.endlessCurrentRun.damageDealt}`
      : "없음";

    return [
      `<article class="battle-briefing${nextOptions.compact ? " compact" : ""}">`,
      '  <div class="battle-briefing-header">',
      '    <div class="battle-briefing-copy">',
      `      <strong>${snapshot.battle.stageName}</strong>`,
      `      <span>${context.leadCopy}</span>`,
      "    </div>",
      `    <div class="flavor-chips battle-briefing-chips">${chips.join("")}</div>`,
      "  </div>",
      nextOptions.compact
        ? ""
        : [
          '  <div class="battle-briefing-metrics">',
          buildBattleBriefingMetric("목표", snapshot.battle.objective, "cyan"),
          buildBattleBriefingMetric("진행", progressText, "gold"),
          buildBattleBriefingMetric("생존", `아군 ${context.alliesAlive} / 적 ${context.enemiesAlive}`, "muted"),
          buildBattleBriefingMetric("보스", bossText, context.bossUnit ? "crimson" : "muted"),
          buildBattleBriefingMetric("보상", `${snapshot.battle.rewardGold || 0}G`, "gold"),
          buildBattleBriefingMetric("현재 런", currentRunText, "violet"),
          "  </div>",
          '  <div class="battle-briefing-notes">',
          `    <p><span>전장 규칙</span>${snapshot.battle.specialRule ? `${snapshot.battle.specialRule.name} - ${snapshot.battle.specialRule.description}` : "특수 규칙 없음"}</p>`,
          `    <p><span>최근 연출</span>${snapshot.battle.lastEventText || "없음"}</p>`,
          context.activeChain ? `    <p><span>연속 사건</span>${context.activeChain.name}</p>` : "",
          "  </div>"
        ].filter(Boolean).join(""),
      "</article>"
    ].join("");
  }

  function buildTileUnitMarkup(unit, options) {
    const nextOptions = options || {};
    const healthPercent = nextOptions.healthPercent != null
      ? nextOptions.healthPercent
      : Math.max(0, Math.min(100, (unit.hp / Math.max(1, unit.maxHp)) * 100));
    const statusMarker = nextOptions.isGhost
      ? "예상"
      : unit.isBoss
        ? "보스"
        : unit.isElite
          ? "정예"
          : "";

    return [
      `  <span class="tile-unit ${unit.team}${unit.isBoss ? " boss" : ""}${unit.isElite ? " elite" : ""}${unit.acted ? " acted" : ""}${nextOptions.isGhost ? " ghost previewing" : ""}">`,
      '    <span class="tile-unit-ring"></span>',
      '    <span class="tile-unit-core">',
      statusMarker ? `      <span class="tile-unit-marker">${statusMarker}</span>` : "",
      `      <span class="tile-unit-name">${getTileDisplayName(unit)}</span>`,
      "    </span>",
      `    <span class="tile-unit-bar"><span style="width:${healthPercent}%"></span></span>`,
      "  </span>"
    ].join("");
  }

  function renderToolbar(snapshot) {
    const endTurnButton = getElement("battle-end-turn-button");
    const turnCounter = getElement("battle-turn-counter");

    if (!endTurnButton || !turnCounter) {
      return;
    }

    turnCounter.textContent = snapshot && snapshot.battle ? `TURN ${snapshot.battle.turnNumber}` : "TURN -";
    endTurnButton.classList.remove("turn-end-attention");

    if (snapshot && snapshot.battle && snapshot.battle.victoryCondition === "support_complete") {
      endTurnButton.textContent = snapshot.battle.pendingChoice ? "보상 선택 필요" : "다음 층 진행";
      endTurnButton.disabled = snapshot.battle.status !== "in_progress" || !!snapshot.battle.pendingChoice;
      return;
    }

    const hasReadyAlly = !!(snapshot && snapshot.battle && snapshot.battle.units.some((unit) =>
      unit.team === "ally" && unit.alive && !unit.acted
    ));

    endTurnButton.textContent = "턴 종료";
    endTurnButton.disabled = !snapshot || !snapshot.battle || snapshot.battle.phase !== "player" || snapshot.battle.status !== "in_progress";
    if (!endTurnButton.disabled && !hasReadyAlly) {
      endTurnButton.classList.add("turn-end-attention");
    }
  }

  function renderTurnInfo(snapshot) {
    const target = getElement("turn-info");

    if (!snapshot || !snapshot.battle) {
      target.textContent = "전투가 시작되지 않았습니다.";
      return;
    }

    const selectedUnit = getSelectedUnit(snapshot);
    const classProfile = selectedUnit ? SkillsService.getClassProfile(selectedUnit) : null;

    target.innerHTML = [
      '<div class="turn-info-stack">',
      selectedUnit && classProfile ? [
        '  <div class="turn-info-class-card">',
        `    ${buildUnitIdentityMarkup(selectedUnit, selectedUnit.className)}`,
        `    <p><span>병종</span>${classProfile.role}</p>`,
        `    ${buildBattleMatchupMarkup(selectedUnit)}`,
        `    <p><span>운용 주의</span>${getBattleCautionSummary(selectedUnit)}</p>`,
        "  </div>"
      ].join("") : '  <p class="empty-copy">유닛을 선택하면 병종 요약이 표시됩니다.</p>',
      "</div>"
    ].filter(Boolean).join("");
  }

  function openBattleInfoModal() {
    const snapshot = viewState.snapshot;

    if (!snapshot || !snapshot.battle) {
      return;
    }

    showModal(buildBattleBriefingMarkup(snapshot));
  }

  function getSelectedUnit(snapshot) {
    if (!snapshot || !snapshot.battle || !snapshot.ui || !snapshot.ui.selectedUnitId) {
      return null;
    }

    return snapshot.battle.units.find((unit) => unit.id === snapshot.ui.selectedUnitId) || null;
  }

  function renderSelectedUnitInfo(snapshot) {
    const target = getElement("selected-unit-info");
    const selectedUnit = getSelectedUnit(snapshot);

    if (!selectedUnit) {
      if (snapshot && snapshot.battle && snapshot.battle.victoryCondition === "support_complete") {
        target.innerHTML = [
          '<div class="unit-summary ally">',
          `  <strong>${snapshot.battle.floorType === "rest" ? "휴식층" : snapshot.battle.floorType === "supply" ? "보급층" : snapshot.battle.floorType === "shop" ? "상점층" : snapshot.battle.floorType === "relic" ? "유물층" : "이벤트층"}</strong>`,
          `  <p>${snapshot.battle.pendingChoice ? "먼저 현재 층의 선택이나 정리를 마쳐야 다음 층으로 진행할 수 있습니다." : snapshot.battle.floorType === "rest" ? "출전 파티가 숨을 돌리며 포인트를 정비했습니다." : snapshot.battle.floorType === "supply" ? "균열 잔해를 정리해 보급품과 골드를 확보했습니다." : snapshot.battle.floorType === "shop" ? "상인이 준비한 물자를 정리했습니다." : "이번 층의 선택 결과가 이후 진행에 반영됩니다."}</p>`,
          "  <p>상단 버튼과 선택 모달을 이용해 엔드리스 진행을 이어가세요.</p>",
          "</div>"
        ].join("");
        return;
      }

      target.innerHTML = '<p class="empty-copy">유닛을 선택하면 상세 정보가 표시됩니다.</p>';
      return;
    }

    const tileType = snapshot.battle.map.tiles[selectedUnit.y] && snapshot.battle.map.tiles[selectedUnit.y][selectedUnit.x]
      ? snapshot.battle.map.tiles[selectedUnit.y][selectedUnit.x]
      : "plain";
    const elevation = snapshot.battle.map.elevations && snapshot.battle.map.elevations[selectedUnit.y]
      ? snapshot.battle.map.elevations[selectedUnit.y][selectedUnit.x] || 0
      : 0;
    const terrainLabel = getTerrainLabel(tileType);
    const effectiveRange = selectedUnit.weapon
      ? CombatService.getEffectiveWeaponRange(selectedUnit, {
        attackerTileType: tileType,
        attackerElevation: elevation,
        defenderElevation: 0
      })
      : null;
    const activeSkillText = BattleService.getActiveSkills(selectedUnit)
      .map((skill) => `${skill.name} Lv.${skill.skillLevel} (${skill.cooldownRemaining > 0 ? `${skill.cooldownRemaining}턴` : "준비"})`)
      .join(", ") || "없음";
    const statusText = formatStatusEffects(selectedUnit);
    const committedMove = snapshot.ui.pendingMove && snapshot.ui.pendingMove.unitId === selectedUnit.id
      ? snapshot.ui.pendingMove
      : selectedUnit.turnMoveCommit || null;
    const movePreview = snapshot.ui.movePreview && snapshot.ui.movePreview.unitId === selectedUnit.id
      ? snapshot.ui.movePreview
      : null;
    const draft = getProgressionDraft(selectedUnit.id);
    const previewUnit = StatsService.previewUnitWithStatDraft(selectedUnit, draft.stats);
    const previewPrimaryStats = StatsService.getPrimaryStats(previewUnit);
    const spentStats = countDraftStats(draft);
    const spentSkills = countDraftSkills(draft);
    const remainingMovement = Math.max(0, selectedUnit.mov - Number(committedMove ? committedMove.spentCost : 0));
    const badgeLine = [
      `Lv.${selectedUnit.level}`,
      `HP ${selectedUnit.hp}/${selectedUnit.maxHp}`,
      `MOV ${selectedUnit.mov}`
    ].join(" / ");
    const enemyMoveHint = selectedUnit.team === "enemy" && snapshot.ui.reachableTiles.length
      ? `적 이동범위 표시 중: 현재 위치 포함 ${snapshot.ui.reachableTiles.length}칸`
      : "";
    const isAttackMode = !!snapshot.ui.pendingAttack;
    const attackPreviewText = selectedUnit.team === "ally" && isAttackMode
      ? (snapshot.ui.attackableTargetIds || []).map((targetId) => {
          const targetUnit = snapshot.battle.units.find((unit) => unit.id === targetId);

          if (!targetUnit) {
            return "";
          }

          const preview = CombatService.calculatePreview(selectedUnit, targetUnit, {
            attackerTileType: tileType,
            defenderTileType: snapshot.battle.map.tiles[targetUnit.y][targetUnit.x],
            attackerElevation: elevation,
            defenderElevation: snapshot.battle.map.elevations && snapshot.battle.map.elevations[targetUnit.y]
              ? snapshot.battle.map.elevations[targetUnit.y][targetUnit.x] || 0
              : 0,
            phase: snapshot.battle.phase
          });

          if (!preview.canAttack) {
            return "";
          }

          const counterPreview = BattleService.calculateCounterPreview(selectedUnit, targetUnit);

          const terrainText = preview.elevationNote || preview.forestAvoidBonus ? [
            preview.elevationNote || null,
            preview.forestAvoidBonus ? "숲 회피" : null
          ].filter(Boolean).join(" / ") : "보정 없음";

          return buildAttackPreviewRowMarkup(targetUnit, preview, counterPreview, terrainText);
        }).filter(Boolean).join("")
      : "";
    const postMoveHint = snapshot.ui.pendingAttack
      ? (
        snapshot.ui.attackableTargetIds.length
          ? "공격 대상 선택: 적 타일을 클릭하면 기본 공격을 실행합니다."
          : "공격 취소: 빈 타일을 클릭하거나 공격 버튼을 다시 누르세요."
      )
      : movePreview
        ? `이동 미리보기: (${movePreview.x}, ${movePreview.y}) / 이번 경로 비용 ${movePreview.cost} / 총 이동 ${movePreview.totalCost} / 남은 이동 ${movePreview.remainingMovement}.`
      : committedMove
        ? (
          remainingMovement > 0
            ? `이동이 확정되었습니다. 남은 이동 ${remainingMovement}칸 범위 안에서 추가 이동을 미리본 뒤 다시 확정할 수 있습니다.`
            : "이동이 확정되었습니다. 이제 공격, 스킬, 아이템 또는 행동 확정을 선택하세요."
        )
        : "";

    const actionButtons = selectedUnit.team === "ally"
      ? (() => {
          const locked = selectedUnit.acted || snapshot.battle.phase !== "player" ? "disabled" : "";
          const undoDisabled = snapshot.ui.pendingMove || movePreview ? "" : "disabled";

          if (movePreview) {
            return [
              '<div class="unit-action-row">',
              '  <button class="primary-button attention-button small-button" type="button" data-action="confirm-move">이동 확정</button>',
              '  <button class="ghost-button attention-button small-button" type="button" data-action="cancel-preview">미리보기 취소</button>',
              `  <button class="ghost-button small-button" type="button" data-action="undo" ${undoDisabled}>원위치 복귀</button>`,
              "</div>"
            ].join("");
          }

          return [
            '<div class="unit-action-row">',
            `  <button class="secondary-button small-button" type="button" data-action="attack" ${locked}>${snapshot.ui.pendingAttack ? "공격 취소 (A)" : "공격 (A)"}</button>`,
            `  <button class="primary-button attention-button small-button" type="button" data-action="wait" ${locked}>행동 확정</button>`,
            `  <button class="ghost-button attention-button small-button" type="button" data-action="undo" ${undoDisabled}>원위치 복귀</button>`,
            `  <button class="ghost-button small-button" type="button" data-action="skill" ${locked}>스킬 (S)</button>`,
            snapshot.ui.pendingSkillId ? '  <button class="ghost-button attention-button small-button" type="button" data-action="cancel-skill">스킬 취소</button>' : "",
            `  <button class="ghost-button small-button" type="button" data-action="item" ${locked}>소모품</button>`,
            '  <button class="ghost-button small-button" type="button" data-action="inventory">장착/인벤토리</button>',
            '  <button class="ghost-button small-button" type="button" data-action="stats">성장 배분</button>',
            "</div>"
          ].join("");
        })()
      : "";

    target.innerHTML = [
      `<div class="unit-summary ${selectedUnit.team}">`,
      `  ${buildUnitIdentityMarkup(selectedUnit, `${selectedUnit.className}${selectedUnit.bossTitle ? ` / ${selectedUnit.bossTitle}` : selectedUnit.eliteTitle ? ` / ${selectedUnit.eliteTitle}` : ""}`)}`,
      `  <p>${badgeLine}</p>`,
      '  <div class="resource-stack">',
      `    <div class="resource-bar hp"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, (selectedUnit.hp / Math.max(1, selectedUnit.maxHp)) * 100))}%"></span></div>`,
      `    <div class="resource-bar exp"><span class="bar-fill" style="width:${Math.max(0, Math.min(100, selectedUnit.exp || 0))}%"></span></div>`,
      "  </div>",
      `  <div class="detail-stats">${StatsService.PRIMARY_STATS.map((statName) => buildPrimaryStatMetaPill(statName, previewPrimaryStats[statName], draft.stats && draft.stats[statName])).join("")}</div>`,
      `  <p>위치: ${terrainLabel}${elevation > 0 ? ` / 고도 ${elevation}` : ""}${effectiveRange && effectiveRange.bonus > 0 ? ` / 사거리 +${effectiveRange.bonus}` : ""}</p>`,
      selectedUnit.enemyEquipmentSummary ? `  <p>장비: ${selectedUnit.weapon ? `${selectedUnit.weapon.name}, ` : ""}${selectedUnit.enemyEquipmentSummary}</p>` : "",
      selectedUnit.eliteTraitName ? `  <p>정예 특성: ${selectedUnit.eliteTraitName}</p>` : "",
      activeSkillText !== "없음" ? `  <p>액티브: ${activeSkillText}</p>` : "",
      statusText !== "없음" ? `  <p>상태: ${statusText}</p>` : "",
      enemyMoveHint ? `  <p class="action-hint enemy-range-hint">${enemyMoveHint}</p>` : "",
      postMoveHint ? `  <p class="action-hint">${postMoveHint}</p>` : "",
      attackPreviewText ? `  <div class="preview-list">${attackPreviewText}</div>` : "",
      committedMove ? `  <p>확정 이동 누적: ${committedMove.spentCost} / ${selectedUnit.mov}</p>` : "",
      selectedUnit.team === "ally" && ((selectedUnit.statPoints || 0) > 0 || (selectedUnit.skillPoints || 0) > 0)
        ? `  <p>남은 성장 포인트: 스탯 ${Math.max(0, (selectedUnit.statPoints || 0) - spentStats)} / 스킬 ${Math.max(0, (selectedUnit.skillPoints || 0) - spentSkills)}</p>`
        : "",
      selectedUnit.team === "ally" && (spentStats || spentSkills)
        ? `  <p class="action-hint">예약 중: 스탯 ${spentStats} / 스킬 ${spentSkills}. 성장 배분 창에서 확정해야 적용됩니다.</p>`
        : "",
      actionButtons,
      "</div>"
    ].filter(Boolean).join("");

    target.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => handleUnitAction(event.currentTarget.dataset.action));
    });
  }

  function handleUnitAction(action) {
    if (!viewState.snapshot) {
      return;
    }

    const selectedUnit = getSelectedUnit(viewState.snapshot);

    if (!selectedUnit) {
      return;
    }

    if (action === "wait") {
      try {
        BattleService.waitSelectedUnit();
      } catch (error) {
        viewState.config.showToast(error.message, true);
      }
      return;
    }

    if (action === "confirm-move") {
      try {
        BattleService.commitMovePreview();
      } catch (error) {
        viewState.config.showToast(error.message, true);
      }
      return;
    }

    if (action === "cancel-preview") {
      BattleService.cancelMovePreview();
      return;
    }

    if (action === "attack") {
      try {
        BattleService.setPendingAttack();
      } catch (error) {
        viewState.config.showToast(error.message, true);
      }
      return;
    }

    if (action === "undo") {
      BattleService.undoMove();
      return;
    }

    if (action === "inventory") {
      openInventoryModal(selectedUnit.id);
      return;
    }

    if (action === "skill") {
      openSkillModal(selectedUnit.id);
      return;
    }

    if (action === "cancel-skill") {
      BattleService.cancelPendingSkill();
      return;
    }

    if (action === "item") {
      openConsumableModal(selectedUnit.id);
      return;
    }

    if (action === "stats") {
      openStatsModal(selectedUnit.id);
    }
  }

  function renderFlavorRibbon(snapshot) {
    const target = getElement("battle-flavor-ribbon");

    if (!target) {
      return;
    }

    if (!snapshot || !snapshot.battle) {
      target.classList.add("hidden");
      target.innerHTML = "";
      return;
    }

    target.classList.remove("hidden");
    target.innerHTML = buildBattleBriefingMarkup(snapshot, { compact: true });
  }

  function renderLog(snapshot) {
    const target = getElement("battle-log");

    if (!snapshot || !snapshot.battle) {
      target.innerHTML = "";
      return;
    }

    const session = getLiveSession();

    if (session.settings && session.settings.actionLogVisible === false) {
      target.innerHTML = '<div class="log-entry">행동 로그 표시가 비활성화되어 있습니다.</div>';
      return;
    }

    target.innerHTML = snapshot.battle.logs
      .slice()
      .reverse()
      .map((entry) => `<div class="log-entry ${getLogEntryClass(entry)}">${entry}</div>`)
      .join("");
  }

  function getLogEntryClass(entry) {
    if (/전장 규칙|균열|유물|이벤트 선택/.test(entry)) {
      return "accent-cyan";
    }

    if (/정예|보스|지휘관|수호자/.test(entry)) {
      return "accent-gold";
    }

    if (/획득|보상|전리품|구매/.test(entry)) {
      return "accent-green";
    }

    if (/피해|격파|공격/.test(entry)) {
      return "accent-red";
    }

    return "";
  }

  function formatStatusEffects(unit) {
    const effects = unit.statusEffects || [];

    if (!effects.length) {
      return "없음";
    }

    return effects
      .map((effect) => {
        if (effect.source === "battlefield") {
          return `${effect.name} (전장)`;
        }

        if (effect.source === "elite-trait") {
          return `${effect.name} (정예)`;
        }

        if (typeof effect.remainingOwnPhases === "number") {
          return `${effect.name} (${effect.remainingOwnPhases}턴)`;
        }

        return effect.name;
      })
      .join(", ");
  }

  function buildAttackPreviewRowMarkup(targetUnit, preview, counterPreview, terrainText) {
    const threatText = preview.damage >= targetUnit.hp
      ? "격파 가능"
      : preview.hitRate >= 80
        ? "우세"
        : "교전";

    return [
      '<article class="preview-row">',
      '  <div class="preview-row-header">',
      `    <strong>${targetUnit.name}</strong>`,
      `    <span class="preview-tag">${threatText}</span>`,
      "  </div>",
      '  <div class="preview-row-metrics">',
      `    <span class="preview-chip is-hit">명중 ${preview.hitRate}%</span>`,
      `    <span class="preview-chip is-damage">피해 ${preview.damage}</span>`,
      `    <span class="preview-chip ${counterPreview.canCounter ? "is-counter" : "is-open"}">${counterPreview.canCounter ? `반격 ${counterPreview.hitRate}% / ${counterPreview.damage}` : "반격 없음"}</span>`,
      "  </div>",
      `  <p class="preview-row-note">전장 보정: ${terrainText}</p>`,
      "</article>"
    ].join("");
  }

  function renderMap(snapshot) {
    const grid = getElement("battle-grid");
    const camera = getElement("battle-camera");
    const scene = getElement("battle-scene");

    if (!snapshot || !snapshot.battle) {
      grid.innerHTML = "";
      return;
    }

    const session = getLiveSession();
    const settings = session.settings;

    camera.style.transform = "none";
    grid.style.setProperty("--grid-cols", snapshot.battle.map.width);
    grid.style.setProperty("--grid-rows", snapshot.battle.map.height);
    grid.style.setProperty("--content-rotation", "0deg");
    grid.classList.toggle("grid-hidden", settings.gridVisible === false);
    scene.className = [
      "battle-scene",
      "scene-topdown",
      `scene-${snapshot.battle.floorType || "combat"}`,
      snapshot.battle.stageId === "endless-rift" ? "scene-endless" : "scene-story",
      snapshot.battle.specialRule ? "scene-rule" : "",
      snapshot.battle.units.some((unit) => unit.alive && unit.isElite) ? "scene-elite" : ""
    ].filter(Boolean).join(" ");

    const tileMarkup = [];
    const selectedUnit = getSelectedUnit(snapshot);
    const movePreview = snapshot.ui.movePreview || null;
    const previewPathKeys = new Set((movePreview && Array.isArray(movePreview.path) ? movePreview.path : []).map((step) => `${step.x},${step.y}`));
    const isEnemyInspection = !!(selectedUnit && selectedUnit.team === "enemy" && !snapshot.ui.pendingAttack && !snapshot.ui.pendingSkillId);

    for (let y = 0; y < snapshot.battle.map.height; y += 1) {
      for (let x = 0; x < snapshot.battle.map.width; x += 1) {
        const unit = snapshot.battle.units.find((entry) => entry.alive && entry.x === x && entry.y === y);
        const tileType = snapshot.battle.map.tiles[y][x];
        const elevation = snapshot.battle.map.elevations && snapshot.battle.map.elevations[y]
          ? snapshot.battle.map.elevations[y][x] || 0
          : 0;
        const classes = ["battle-tile", `tile-${tileType}`];
        const isReachable = snapshot.ui.reachableTiles.some((tile) => tile.x === x && tile.y === y);
        const isAttack = snapshot.ui.attackTiles.some((tile) => tile.x === x && tile.y === y);
        const isSkillTile = snapshot.ui.skillTiles.some((tile) => tile.x === x && tile.y === y);
        const isSkillTarget = unit && snapshot.ui.skillTargetIds.includes(unit.id);
        const reachableTile = snapshot.ui.reachableTiles.find((tile) => tile.x === x && tile.y === y) || null;
        const canPreviewAttack = !!(unit && unit.team === "enemy" && snapshot.ui.attackableTargetIds.includes(unit.id) && selectedUnit && selectedUnit.team === "ally");
        const counterPreview = canPreviewAttack ? BattleService.calculateCounterPreview(selectedUnit, unit) : null;
        const marker = snapshot.battle.map.markers.find((entry) => entry.x === x && entry.y === y) || null;
        const visibleMarker = shouldDisplayTileMarker(snapshot, marker) ? marker : null;
        const tileStyle = [`--tile-level:${elevation}`].join(";");
        const isMovePreviewPath = previewPathKeys.has(`${x},${y}`);
        const isMovePreviewTarget = !!(movePreview && movePreview.x === x && movePreview.y === y);

        if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
          classes.push("is-selected");
        }

        if (isReachable) {
          classes.push(isEnemyInspection ? "is-enemy-reachable" : "is-reachable");
        }

        if (isMovePreviewPath) {
          classes.push("is-preview-path");
        }

        if (isMovePreviewTarget) {
          classes.push("is-preview-path-end");
        }

        if (isAttack) {
          classes.push("is-attack");
        }

        if (isSkillTile) {
          classes.push("is-skill-range");
        }

        if (canPreviewAttack) {
          classes.push("is-attackable-enemy");
          classes.push(counterPreview && counterPreview.canCounter ? "is-counter-threat" : "is-counter-open");
        }

        if (isSkillTarget) {
          classes.push("is-skill-target");
        }

        if (unit && isAttack) {
          classes.push("has-attack-highlighted-unit");
        }

        if (unit && (isSkillTile || isSkillTarget)) {
          classes.push("has-skill-highlighted-unit");
        }

        if (unit) {
          classes.push(unit.team === "ally" ? "has-ally" : "has-enemy");
        }

        if (unit && unit.acted) {
          classes.push("has-acted-unit");
        }

        tileMarkup.push([
          `<button class="${classes.join(" ")}" type="button" data-x="${x}" data-y="${y}" style="${tileStyle}">`,
          `  <span class="tile-elevation"></span>`,
          `  <span class="tile-top"></span>`,
          `  <span class="tile-overlay"></span>`,
          isReachable && reachableTile ? `  <span class="tile-cost ${isEnemyInspection ? "is-enemy-range" : ""}">${reachableTile.cost}</span>` : "",
          unit ? buildTileUnitMarkup(unit) : "",
          !unit && isMovePreviewTarget && selectedUnit && movePreview && movePreview.unitId === selectedUnit.id ? [
            buildTileUnitMarkup(selectedUnit, {
              isGhost: true,
              healthPercent: 100,
              tagText: "예상 이동"
            })
          ].join("") : "",
          visibleMarker ? `  <span class="tile-marker tile-marker-${visibleMarker.type}">${visibleMarker.label}</span>` : "",
          !unit && !isMovePreviewTarget && !visibleMarker && tileType === "forest" ? '  <span class="tile-deco">숲</span>' : "",
          !unit && !isMovePreviewTarget && !visibleMarker && tileType === "hill" ? '  <span class="tile-deco">고지</span>' : "",
          !unit && !isMovePreviewTarget && !visibleMarker && tileType === "marsh" ? '  <span class="tile-deco">습지</span>' : "",
          !unit && !isMovePreviewTarget && !visibleMarker && tileType === "ruin" ? '  <span class="tile-deco">폐허</span>' : "",
          !unit && !isMovePreviewTarget && !visibleMarker && tileType === "wall" ? '  <span class="tile-deco">벽</span>' : "",
          "</button>"
        ].join(""));
      }
    }

    grid.innerHTML = tileMarkup.join("");
    maybeCenterBattleScene(snapshot);
    grid.querySelectorAll(".battle-tile").forEach((button) => {
      button.addEventListener("click", () => {
        BattleService.handleTileSelection(Number(button.dataset.x), Number(button.dataset.y));
      });

      button.addEventListener("mouseenter", () => {
        const hoveredUnit = snapshot.battle.units.find(
          (entry) => entry.alive && entry.x === Number(button.dataset.x) && entry.y === Number(button.dataset.y)
        );
        const hoveredTile = snapshot.ui.reachableTiles.find(
          (tile) => tile.x === Number(button.dataset.x) && tile.y === Number(button.dataset.y)
        );

        applyMovePathPreview(hoveredTile ? hoveredTile.path : []);
        renderHoverPreview(snapshot, hoveredUnit, button, Number(button.dataset.x), Number(button.dataset.y));
      });

      button.addEventListener("mouseleave", () => {
        clearMovePathPreview();
        hideHoverPreview();
      });
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMapTileType(snapshot, x, y) {
    return snapshot.battle.map.tiles[y] && snapshot.battle.map.tiles[y][x]
      ? snapshot.battle.map.tiles[y][x]
      : "plain";
  }

  function getMapElevation(snapshot, x, y) {
    return snapshot.battle.map.elevations && snapshot.battle.map.elevations[y]
      ? snapshot.battle.map.elevations[y][x] || 0
      : 0;
  }

  function getPendingSkillPreview(snapshot, selectedUnit, hoveredUnit) {
    if (
      !snapshot ||
      !selectedUnit ||
      !hoveredUnit ||
      !snapshot.ui.pendingSkillId ||
      !snapshot.ui.skillTargetIds.includes(hoveredUnit.id)
    ) {
      return null;
    }

    const skill = BattleService.getActiveSkills(selectedUnit).find((entry) => entry.id === snapshot.ui.pendingSkillId);

    if (!skill) {
      return null;
    }

    const performance = SkillsService.getSkillPerformance(selectedUnit, skill);

    if (skill.effect.kind === "attack") {
      const basePreview = CombatService.calculatePreview(selectedUnit, hoveredUnit, {
        attackerTileType: getMapTileType(snapshot, selectedUnit.x, selectedUnit.y),
        defenderTileType: getMapTileType(snapshot, hoveredUnit.x, hoveredUnit.y),
        attackerElevation: getMapElevation(snapshot, selectedUnit.x, selectedUnit.y),
        defenderElevation: getMapElevation(snapshot, hoveredUnit.x, hoveredUnit.y),
        phase: snapshot.battle.phase,
        isInitiator: true,
        damageType: skill.effect.damageType || null
      });

      if (!basePreview.canAttack) {
        return {
          skill,
          lines: ["<span>현재 무기로는 이 스킬을 연결할 수 없습니다.</span>"]
        };
      }

      const skillHitBonus = performance && performance.kind === "attack"
        ? performance.hitBonus
        : Number(skill.effect.hitBonus || 0);
      const skillDamageBonus = performance && performance.kind === "attack"
        ? performance.damageBonus
        : Number(skill.effect.damageBonus || 0);
      const hitRate = clamp((basePreview.hitRate || 0) + skillHitBonus, 5, 100);
      const damage = Math.max(0, (basePreview.damage || 0) + skillDamageBonus);
      const critRate = clamp(basePreview.critRate || 0, 0, 100);
      const critMultiplier = Number(basePreview.critMultiplier || 1.5);
      const critDamage = Math.max(damage, Math.round(damage * critMultiplier));
      const expectedDamage = Math.round((hitRate / 100) * (
        damage + ((critRate / 100) * Math.max(0, critDamage - damage))
      ));

      return {
        skill,
        lines: [
          `<span>${skill.name}: 명중 ${hitRate}% / 예상 피해 ${damage}</span>`,
          `<span>평균 기대값 ${expectedDamage} / 치명 ${critRate}% 시 ${critDamage}</span>`,
          `<span>마무리 예상: ${damage >= hoveredUnit.hp ? "처치 가능" : `${Math.max(0, hoveredUnit.hp - damage)} HP 남음`}</span>`
        ]
      };
    }

    if (skill.effect.kind === "heal") {
      const amount = Math.min(
        performance && performance.kind === "heal" ? performance.amount : Number(skill.effect.amount || 0),
        Math.max(0, hoveredUnit.maxHp - hoveredUnit.hp)
      );

      return {
        skill,
        lines: [
          `<span>${skill.name}: 회복 예상 ${amount}</span>`,
          `<span>적용 후 HP ${Math.min(hoveredUnit.maxHp, hoveredUnit.hp + amount)} / ${hoveredUnit.maxHp}</span>`
        ]
      };
    }

    if (skill.effect.kind === "buff") {
      const summary = performance && performance.kind === "buff"
        ? performance.currentSummary
        : "버프 수치 없음";

      return {
        skill,
        lines: [
          `<span>${skill.name}: ${summary}</span>`,
          `<span>현재 대상에게 적용될 강화 효과를 미리 본 값입니다.</span>`
        ]
      };
    }

    return null;
  }

  function maybeCenterBattleScene(snapshot) {
    const scene = getElement("battle-scene");

    if (!scene || !snapshot || !snapshot.battle || viewState.centeredBattleId === snapshot.battle.id) {
      return;
    }

    viewState.centeredBattleId = snapshot.battle.id;
    global.requestAnimationFrame(() => {
      scene.scrollLeft = Math.max(0, (scene.scrollWidth - scene.clientWidth) / 2);
      scene.scrollTop = Math.max(0, (scene.scrollHeight - scene.clientHeight) / 2);
    });
  }

  function renderHoverPreview(snapshot, hoveredUnit, anchorElement, tileX, tileY) {
    const target = getElement("battle-hover-preview");
    const selectedUnit = getSelectedUnit(snapshot);
    const resolvedX = Number.isFinite(tileX) ? tileX : (hoveredUnit ? hoveredUnit.x : null);
    const resolvedY = Number.isFinite(tileY) ? tileY : (hoveredUnit ? hoveredUnit.y : null);

    if (!target || resolvedX === null || resolvedY === null) {
      hideHoverPreview();
      return;
    }

    const tileType = getMapTileType(snapshot, resolvedX, resolvedY);
    const terrain = CombatService.getTerrainModifier(tileType);
    const elevation = getMapElevation(snapshot, resolvedX, resolvedY);
    const marker = snapshot.battle.map.markers.find((entry) => entry.x === resolvedX && entry.y === resolvedY) || null;
    const occupant = hoveredUnit || snapshot.battle.units.find((entry) => entry.alive && entry.x === resolvedX && entry.y === resolvedY) || null;
    const lines = [
      `<strong>${getTerrainLabel(tileType)} 타일</strong>`,
      `<span>방어 보정 ${terrain.defense} / 회피 보정 ${terrain.avoid}</span>`,
      `<span>이동 비용 ${formatMoveCost(terrain.moveCost)} / 고도 ${elevation}</span>`
    ];

    if (shouldDisplayTileMarker(snapshot, marker)) {
      lines.push(`<span>표식: ${marker.label}</span>`);
    }

    if (occupant) {
      lines.push(`<span>점유 유닛: ${occupant.name} (${occupant.team === "ally" ? "아군" : "적"})</span>`);
    }

    if (
      selectedUnit &&
      hoveredUnit &&
      hoveredUnit.team === "enemy" &&
      snapshot.ui.attackableTargetIds.includes(hoveredUnit.id)
    ) {
      const preview = CombatService.calculatePreview(selectedUnit, hoveredUnit, {
        attackerTileType: getMapTileType(snapshot, selectedUnit.x, selectedUnit.y),
        defenderTileType: getMapTileType(snapshot, hoveredUnit.x, hoveredUnit.y),
        attackerElevation: getMapElevation(snapshot, selectedUnit.x, selectedUnit.y),
        defenderElevation: getMapElevation(snapshot, hoveredUnit.x, hoveredUnit.y),
        phase: snapshot.battle.phase,
        isInitiator: true
      });
      const counterPreview = BattleService.calculateCounterPreview(selectedUnit, hoveredUnit);

      lines.push(`<span class="hover-preview-divider">전투 예상</span>`);
      lines.push(`<span>공격: 명중 ${preview.hitRate}% / 예상 피해 ${preview.damage}</span>`);
      lines.push(`<span>치명: ${preview.critRate || 0}% / 치명 피해 ${preview.critDamage || preview.damage}</span>`);
      lines.push(`<span>반격: ${counterPreview.canCounter ? `명중 ${counterPreview.hitRate}% / 피해 ${counterPreview.damage}` : "없음"}</span>`);
      lines.push(`<span>전투 보정: ${preview.elevationNote || (preview.forestAvoidBonus ? "숲 회피" : "없음")}</span>`);
    }

    const pendingSkillPreview = getPendingSkillPreview(snapshot, selectedUnit, hoveredUnit);

    if (pendingSkillPreview) {
      lines.push(`<span class="hover-preview-divider">스킬 예상</span>`);
      pendingSkillPreview.lines.forEach((line) => lines.push(line));
    }

    target.classList.remove("hidden");
    target.innerHTML = lines.join("");

    if (anchorElement) {
      const anchorRect = anchorElement.getBoundingClientRect();
      const previewRect = target.getBoundingClientRect();
      const gap = 12;
      const viewportPadding = 12;
      const preferRightLeft = anchorRect.right + gap;
      const fallbackLeft = anchorRect.left - previewRect.width - gap;
      const nextLeft = preferRightLeft + previewRect.width <= window.innerWidth - viewportPadding
        ? preferRightLeft
        : Math.max(viewportPadding, fallbackLeft);
      const maxTop = Math.max(viewportPadding, window.innerHeight - previewRect.height - viewportPadding);
      const nextTop = clamp(anchorRect.top + 6, viewportPadding, maxTop);

      target.style.left = `${nextLeft}px`;
      target.style.top = `${nextTop}px`;
    }
  }

  function applyMovePathPreview(path) {
    clearMovePathPreview();

    if (!Array.isArray(path) || !path.length) {
      return;
    }

    const pathKeys = new Set(path.map((step) => `${step.x},${step.y}`));
    const lastStep = path[path.length - 1];

    document.querySelectorAll(".battle-tile").forEach((tile) => {
      const key = `${tile.dataset.x},${tile.dataset.y}`;

      if (pathKeys.has(key)) {
        tile.classList.add("is-path");
      }

      if (lastStep && Number(tile.dataset.x) === lastStep.x && Number(tile.dataset.y) === lastStep.y) {
        tile.classList.add("is-path-end");
      }
    });
  }

  function clearMovePathPreview() {
    document.querySelectorAll(".battle-tile.is-path, .battle-tile.is-path-end").forEach((tile) => {
      tile.classList.remove("is-path", "is-path-end");
    });
  }

  function hideHoverPreview() {
    const target = getElement("battle-hover-preview");

    if (!target) {
      return;
    }

    target.classList.add("hidden");
    target.innerHTML = "";
  }

  function renderStatusBanner(snapshot) {
    const banner = getElement("battle-status-banner");

    if (!snapshot || !snapshot.battle || snapshot.battle.status === "in_progress") {
      viewState.statusOverlayKey = null;
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }

    banner.classList.add("hidden");
    const rewardItems = ((snapshot.battle.rewardHistory || []).map((item) => formatRewardItemLabel(item)).filter(Boolean).join(", ")) || "없음";
    const endlessSummary = snapshot.battle.stageId === "endless-rift" && snapshot.saveData
      ? BattleService.getEndlessRunSummary(snapshot.saveData)
      : null;
    const endlessStats = endlessSummary && endlessSummary.stats ? endlessSummary.stats : null;
    const overlayKey = `${snapshot.battle.id}:${snapshot.battle.status}`;

    banner.innerHTML = [
      `<strong>${snapshot.battle.status === "victory" ? "승리" : "패배"}</strong>`,
      `<span>${snapshot.battle.status === "victory" ? `${snapshot.battle.rewardGold || 0}G를 획득했습니다.` : "전열이 붕괴되어 작전을 정비해야 합니다."}</span>`,
      snapshot.battle.status === "victory" ? `<span>획득 아이템: ${rewardItems}</span>` : "",
      endlessSummary ? `<span>균열 기록: ${endlessSummary.floor}층 / 유물 ${endlessSummary.relicNames.length}개 / 최고 ${endlessSummary.bestFloor}층</span>` : "",
      endlessStats ? `<span>런 통계: 적 ${endlessStats.enemiesDefeated} / 정예 ${endlessStats.eliteDefeated} / 보스 ${endlessStats.bossesDefeated} / 피해 ${endlessStats.damageDealt} / 획득 ${endlessStats.goldEarned}G</span>` : ""
    ].join("");

    if (viewState.statusOverlayKey === overlayKey) {
      return;
    }

    viewState.statusOverlayKey = overlayKey;
    showBattleResultOverlay(snapshot, {
      rewardItems,
      endlessSummary,
      endlessStats
    });
  }

  function buildBattleResultOverlayMarkup(snapshot, context) {
    const nextContext = context || {};
    const isVictory = snapshot.battle.status === "victory";
    const nextActionLabel = isVictory ? "다음 전투" : "다시 도전";
    const summaryCopy = isVictory
      ? `${snapshot.battle.rewardGold || 0}G를 확보했고, 다음 공세 준비가 완료되었습니다.`
      : "현재 전투는 실패했습니다. 파티를 정비한 뒤 다시 진입할 수 있습니다.";
    const rewardCopy = isVictory
      ? (nextContext.rewardItems && nextContext.rewardItems !== "없음" ? nextContext.rewardItems : "획득 아이템 없음")
      : "지휘 라인을 재정비해야 합니다.";
    const endlessSummary = nextContext.endlessSummary;
    const endlessStats = nextContext.endlessStats;

    return [
      `<article class="battle-result-modal ${isVictory ? "is-victory" : "is-defeat"}">`,
      '  <div class="battle-result-hero">',
      `    <span class="battle-result-kicker">${isVictory ? "Operation Clear" : "Operation Lost"}</span>`,
      `    <strong>${isVictory ? "작전 승리" : "작전 실패"}</strong>`,
      `    <p>${summaryCopy}</p>`,
      "  </div>",
      buildBattleBriefingMarkup(snapshot, { compact: true }),
      '  <section class="battle-result-summary">',
      '    <div class="battle-result-summary-grid">',
      buildBattleBriefingMetric("결과", isVictory ? "스테이지 클리어" : "전투 패배", isVictory ? "gold" : "crimson"),
      buildBattleBriefingMetric("골드", `${snapshot.battle.rewardGold || 0}G`, "gold"),
      buildBattleBriefingMetric("전리품", rewardCopy, isVictory ? "cyan" : "muted"),
      endlessSummary
        ? buildBattleBriefingMetric("균열 기록", `${endlessSummary.floor}층 / 최고 ${endlessSummary.bestFloor}층`, "violet")
        : buildBattleBriefingMetric("다음 행동", isVictory ? "다음 구역 진입 가능" : "파티 정비 필요", "muted"),
      "    </div>",
      endlessStats
        ? `<p class="battle-result-footnote">런 통계: 적 ${endlessStats.enemiesDefeated} / 정예 ${endlessStats.eliteDefeated} / 보스 ${endlessStats.bossesDefeated} / 피해 ${endlessStats.damageDealt} / 획득 ${endlessStats.goldEarned}G</p>`
        : `<p class="battle-result-footnote">${isVictory ? "메뉴에서 바로 다음 전투를 시작할 수 있습니다." : "메뉴에서 편성과 장비를 다시 정리한 뒤 재도전할 수 있습니다."}</p>`,
      "  </section>",
      '  <div class="button-row battle-result-actions">',
      '    <button id="battle-result-menu-button" class="secondary-button" type="button">메뉴로</button>',
      `    <button id="battle-result-next-button" class="${isVictory ? "primary-button" : "ghost-button"}" type="button">${nextActionLabel}</button>`,
      "  </div>",
      "</article>"
    ].join("");
  }

  function showBattleResultOverlay(snapshot, context) {
    showModal(buildBattleResultOverlayMarkup(snapshot, context), {
      panelClass: "modal-panel-wide battle-result-modal-panel",
      bodyClass: "battle-result-modal-body"
    });

    if (!viewState.modal) {
      return;
    }

    viewState.modal.dataset.locked = "true";
    getElement("modal-close-button").classList.add("hidden");
    getElement("battle-result-menu-button").addEventListener("click", () => {
      viewState.modal.dataset.locked = "false";
      handleReturnMenu();
    });
    getElement("battle-result-next-button").addEventListener("click", () => {
      viewState.modal.dataset.locked = "false";
      closeModal();
      startNewBattle(getLiveSession());
    });
  }

  function maybeAnnounceStatus(snapshot) {
    if (!snapshot || !snapshot.battle || snapshot.battle.status === "in_progress") {
      return;
    }

    if (viewState.statusAnnounced === snapshot.battle.status) {
      return;
    }

    viewState.statusAnnounced = snapshot.battle.status;
    const message = snapshot.battle.status === "victory" ? "스테이지 클리어" : "전투 패배";
    viewState.config.showToast(message, snapshot.battle.status !== "victory");
  }

  function maybeShowCutscene(snapshot) {
    if (!snapshot || !snapshot.battle || snapshot.battle.status !== "in_progress") {
      return;
    }

    if (snapshot.battle.cutsceneSeen || !snapshot.battle.cutsceneLines || !snapshot.battle.cutsceneLines.length) {
      return;
    }

    if (viewState.modal) {
      return;
    }

    const body = [
      `<h3>${snapshot.battle.cutsceneTitle || "작전 브리핑"}</h3>`,
      '<div class="modal-list">',
      '<article class="modal-card cutscene-card">',
      `<p><strong>${snapshot.battle.stageName}</strong></p>`,
      ...snapshot.battle.cutsceneLines.map((line) => `<p>${line}</p>`),
      '<div class="button-row">',
      '  <button id="cutscene-start-button" class="primary-button small-button" type="button">출진</button>',
      "</div>",
      "</article>",
      "</div>"
    ].join("");

    showModal(body);
    viewState.modal.dataset.locked = "true";
    getElement("modal-close-button").classList.add("hidden");
    getElement("cutscene-start-button").addEventListener("click", () => {
      BattleService.markCutsceneSeen();
      viewState.modal.dataset.locked = "false";
      closeModal();
    });
  }

  function buildPrologueTutorialPages(snapshot) {
    const roster = snapshot && snapshot.saveData && Array.isArray(snapshot.saveData.roster)
      ? snapshot.saveData.roster
      : [];
    const starterUnits = [
      {
        unit: roster.find((entry) => entry.id === "hero-1") || { name: "리아", className: "로드" },
        summary: "균형형 전열 리더. 안정적인 근접전과 무난한 기동으로 첫 진입을 맡기 좋습니다."
      },
      {
        unit: roster.find((entry) => entry.id === "ally-2") || { name: "도윤", className: "랜서" },
        summary: "단단한 전열 유지형. 길목을 막고 적의 접근을 받아내는 역할에 강합니다."
      },
      {
        unit: roster.find((entry) => entry.id === "ally-3") || { name: "세라", className: "아처" },
        summary: "후열 원거리 견제형. 안전한 거리에서 적 체력을 깎아 전열을 지원합니다."
      }
    ];

    return [
      {
        title: "프롤로그 전술 안내",
        kicker: "1 / 2",
        body: [
          '<div class="modal-list">',
          '<article class="modal-card cutscene-card">',
          '  <p><strong>처음 지급되는 3명</strong></p>',
          '  <p>첫 맵에서는 각자의 역할만 익혀도 전투 흐름을 바로 잡을 수 있습니다.</p>',
          "</article>",
          ...starterUnits.map(({ unit, summary }) => [
            '<article class="modal-card cutscene-card">',
            `  <div class="item-title-row"><strong>${unit.name}</strong><span>${unit.className}</span></div>`,
            `  <p>${summary}</p>`,
            "</article>"
          ].join("")),
          "</div>"
        ].join("")
      },
      {
        title: "기본 조작",
        kicker: "2 / 2",
        body: [
          '<div class="modal-list">',
          '<article class="modal-card cutscene-card">',
          '  <p><strong>키보드 단축키</strong></p>',
          '  <p><span class="meta-pill is-cyan">A</span> 선택한 아군의 공격을 바로 준비합니다.</p>',
          '  <p><span class="meta-pill is-cyan">S</span> 선택한 아군의 스킬 목록을 엽니다.</p>',
          '  <p><span class="meta-pill is-cyan">Space</span> 이동 확정, 행동 확정, 턴 진행에 사용합니다.</p>',
          "</article>",
          '<article class="modal-card cutscene-card">',
          '  <p><strong>상세 보기</strong></p>',
          '  <p>내 캐릭터나 적 캐릭터를 클릭하면 이름, 직업, 상성, 장비, 스킬 같은 상세 정보를 확인할 수 있습니다.</p>',
          '  <p>전열은 버티고, 후열은 안전한 거리에서 공격하는 식으로 시작하면 첫 전투가 편합니다.</p>',
          "</article>",
          "</div>"
        ].join("")
      }
    ];
  }

  function renderPrologueTutorialPage(snapshot, pageIndex) {
    const pages = buildPrologueTutorialPages(snapshot);
    const boundedPageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    const page = pages[boundedPageIndex];
    const titleNode = getElement("prologue-tutorial-title");
    const kickerNode = getElement("prologue-tutorial-kicker");
    const contentNode = getElement("prologue-tutorial-content");
    const prevButton = getElement("prologue-tutorial-prev");
    const nextButton = getElement("prologue-tutorial-next");

    if (!titleNode || !kickerNode || !contentNode || !prevButton || !nextButton) {
      return;
    }

    titleNode.textContent = page.title;
    kickerNode.textContent = page.kicker;
    contentNode.innerHTML = page.body;
    prevButton.disabled = boundedPageIndex <= 0;
    nextButton.textContent = boundedPageIndex >= pages.length - 1 ? "시작하기" : "다음";
    nextButton.dataset.pageIndex = String(boundedPageIndex);
    prevButton.dataset.pageIndex = String(boundedPageIndex);
  }

  function openPrologueTutorialModal(snapshot) {
    const body = [
      '<div class="battle-skill-modal">',
      '  <section class="battle-result-hero battle-skill-hero">',
      '    <div class="item-title-row">',
      '      <strong id="prologue-tutorial-title">프롤로그 전술 안내</strong>',
      '      <span id="prologue-tutorial-kicker">1 / 2</span>',
      "    </div>",
      '    <p>프롤로그 평원에서는 이 기본 조작만 익히면 바로 진행할 수 있습니다.</p>',
      "  </section>",
      '  <div id="prologue-tutorial-content"></div>',
      '  <div class="button-row">',
      '    <button id="prologue-tutorial-prev" class="ghost-button small-button" type="button">이전</button>',
      '    <button id="prologue-tutorial-next" class="primary-button small-button" type="button">다음</button>',
      "  </div>",
      "</div>"
    ].join("");

    showModal(body, {
      panelClass: "modal-panel-wide battle-skill-modal-panel",
      bodyClass: "battle-skill-modal-body"
    });

    viewState.modal.dataset.locked = "true";
    getElement("modal-close-button").classList.add("hidden");
    renderPrologueTutorialPage(snapshot, 0);
    BattleService.markTutorialSeen("prologueFieldIntroShown");

    getElement("prologue-tutorial-prev").addEventListener("click", () => {
      const currentPageIndex = Number(getElement("prologue-tutorial-prev").dataset.pageIndex || 0);
      renderPrologueTutorialPage(viewState.snapshot || snapshot, currentPageIndex - 1);
    });

    getElement("prologue-tutorial-next").addEventListener("click", () => {
      const pages = buildPrologueTutorialPages(viewState.snapshot || snapshot);
      const currentPageIndex = Number(getElement("prologue-tutorial-next").dataset.pageIndex || 0);

      if (currentPageIndex >= pages.length - 1) {
        viewState.modal.dataset.locked = "false";
        closeModal();
        return;
      }

      renderPrologueTutorialPage(viewState.snapshot || snapshot, currentPageIndex + 1);
    });
  }

  function maybeShowPrologueTutorial(snapshot) {
    if (!snapshot || !snapshot.battle || snapshot.battle.status !== "in_progress") {
      return;
    }

    if (snapshot.battle.stageId !== "prologue-field" || !snapshot.battle.cutsceneSeen || viewState.modal) {
      return;
    }

    if (snapshot.saveData && snapshot.saveData.tutorial && snapshot.saveData.tutorial.prologueFieldIntroShown) {
      return;
    }

    openPrologueTutorialModal(snapshot);
  }

  function maybeShowSupportChoice(snapshot) {
    if (!snapshot || !snapshot.battle || !snapshot.battle.pendingChoice || snapshot.battle.status !== "in_progress") {
      return;
    }

    if (!snapshot.battle.cutsceneSeen || viewState.modal) {
      return;
    }

    const body = [
      `<h3>${snapshot.battle.pendingChoice.title}</h3>`,
      snapshot.battle.pendingChoice.description ? `<p>${snapshot.battle.pendingChoice.description}</p>` : "",
      '<div class="modal-list">'
    ];

    (snapshot.battle.pendingChoice.choices || []).forEach((choice) => {
      const suffix = snapshot.battle.pendingChoice.type === "relic"
        ? "유물"
        : snapshot.battle.pendingChoice.type === "shop"
          ? `${choice.price}G`
          : snapshot.battle.pendingChoice.type === "contact"
            ? "접촉"
          : "사건";
      body.push([
        '<article class="modal-card cutscene-card">',
        `  <div class="item-title-row"><strong>${choice.title}</strong><span>${suffix}</span></div>`,
        `  <p>${choice.description}</p>`,
        `  <button class="primary-button small-button" type="button" data-support-choice="${choice.id}">${snapshot.battle.pendingChoice.type === "shop" ? "구매" : "선택"}</button>`,
        "</article>"
      ].join(""));
    });

    if (snapshot.battle.pendingChoice.type === "shop") {
      body.push([
        '<article class="modal-card cutscene-card">',
        '  <p>구매를 마쳤다면 정리 완료 후 다음 층으로 이동할 수 있습니다.</p>',
        '  <div class="button-row">',
        '    <button class="secondary-button small-button" type="button" data-support-finish="shop">정리 완료</button>',
        "  </div>",
        "</article>"
      ].join(""));
    }

    body.push("</div>");
    showModal(body.join(""));
    viewState.modal.dataset.locked = "true";
    getElement("modal-close-button").classList.add("hidden");

    getElement("battle-modal-host").querySelectorAll("[data-support-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          if (snapshot.battle.pendingChoice.type === "shop") {
            const item = BattleService.purchaseEndlessShopItem(button.dataset.supportChoice);
            viewState.config.showToast(`${item.name} 구매`);
            viewState.modal.dataset.locked = "false";
            closeModal();
            maybeShowSupportChoice(viewState.snapshot);
            return;
          }

          const choice = BattleService.chooseEndlessReward(button.dataset.supportChoice);
          viewState.config.showToast(`${choice.title} 선택`);
          viewState.modal.dataset.locked = "false";
          closeModal();
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });

    getElement("battle-modal-host").querySelectorAll("[data-support-finish]").forEach((button) => {
      button.addEventListener("click", () => {
        if (BattleService.dismissEndlessChoice()) {
          viewState.modal.dataset.locked = "false";
          closeModal();
        }
      });
    });
  }

  async function handleEndTurn() {
    if (!viewState.snapshot || viewState.aiRunning || viewState.snapshot.battle.phase !== "player") {
      return;
    }

    if (viewState.snapshot.battle.victoryCondition === "support_complete") {
      if (!BattleService.completeSupportFloor()) {
        viewState.config.showToast("먼저 현재 층의 선택 보상을 완료하세요.", true);
      }
      return;
    }

    const session = getLiveSession();

    if (session.settings.confirmEndTurn && !global.confirm("현재 아군 턴을 종료하고 적 턴으로 넘기시겠습니까?")) {
      return;
    }

    await executeEndTurnFlow();
  }

  function handleReturnMenu() {
    closeModal();
    hideHoverPreview();
    BattleService.leaveBattle();
    viewState.aiRunning = false;
    viewState.sessionRef = null;
    viewState.progressionDrafts = {};
    if (viewState.config && typeof viewState.config.onReturnMenu === "function") {
      viewState.config.onReturnMenu();
    }
  }

  function openInventoryModal(unitId) {
    const snapshot = viewState.snapshot;
    const unit = snapshot.saveData.roster.find((entry) => entry.id === unitId);
    const items = (snapshot.saveData.inventory || []).filter((item) => !InventoryService.isConsumable(item));

    const body = [
      `<h3>${unit.name} 장비 변경</h3>`,
      '<div class="modal-list">'
    ];

    items.forEach((item) => {
      const canEquip = InventoryService.canEquip(snapshot.saveData, unit, item);
      const rarityMeta = InventoryService.getRarityMeta(item.rarity);
      const disabled = !canEquip ? "disabled" : "";
      const equipLabel = item.equippedBy === unit.id ? "장착 중" : "장착";

      body.push([
        `<article class="modal-card">`,
        `  <div class="item-title-row"><strong style="color: var(${rarityMeta.colorVar});">${item.name}</strong><span>${rarityMeta.label}</span></div>`,
        `  <p>${InventoryService.describeItem(item)}</p>`,
        `  <p>${item.equippedBy ? `현재 장착: ${item.equippedBy}` : "미장착"}</p>`,
        `  <button class="secondary-button small-button" type="button" data-equip-item="${item.id}" ${disabled}>${equipLabel}</button>`,
        "</article>"
      ].join(""));
    });

    body.push("</div>");
    showModal(body.join(""));

    getElement("battle-modal-host").querySelectorAll("[data-equip-item]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const item = BattleService.equipItem(unitId, button.dataset.equipItem);
          viewState.config.showToast(`${unit.name}이(가) ${item.name} 장착`);
          openInventoryModal(unitId);
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });
  }

  function openConsumableModal(unitId) {
    const snapshot = viewState.snapshot;
    const unit = snapshot.battle.units.find((entry) => entry.id === unitId);
    const items = (snapshot.saveData.inventory || []).filter((item) => InventoryService.isConsumable(item));
    const body = [
      `<h3>${unit.name} 소모품 사용</h3>`,
      '<div class="modal-list">'
    ];

    if (!items.length) {
      body.push('<article class="modal-card"><p>사용 가능한 소모품이 없습니다.</p></article>');
    } else {
      items.forEach((item) => {
        const rarityMeta = InventoryService.getRarityMeta(item.rarity);
        body.push([
          `<article class="modal-card">`,
          `  <div class="item-title-row"><strong style="color: var(${rarityMeta.colorVar});">${item.name}</strong><span>${rarityMeta.label}</span></div>`,
          `  <p>${InventoryService.describeItem(item)}</p>`,
          `  <button class="secondary-button small-button" type="button" data-use-item="${item.id}">사용</button>`,
          "</article>"
        ].join(""));
      });
    }

    body.push("</div>");
    showModal(body.join(""), {
      panelClass: "modal-panel-wide battle-skill-modal-panel",
      bodyClass: "battle-skill-modal-body"
    });

    getElement("battle-modal-host").querySelectorAll("[data-use-item]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const result = BattleService.useConsumable(button.dataset.useItem);
          if (result) {
            viewState.config.showToast(`${unit.name} 회복 +${result.healed}`);
            closeModal();
          }
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });
  }

  function getSkillRangeSummary(unit, skill) {
    if (!skill) {
      return "-";
    }

    if (skill.useWeaponRange) {
      const tileType = viewState.snapshot && viewState.snapshot.battle && viewState.snapshot.battle.map
        && viewState.snapshot.battle.map.tiles[unit.y] && viewState.snapshot.battle.map.tiles[unit.y][unit.x]
        ? viewState.snapshot.battle.map.tiles[unit.y][unit.x]
        : "plain";
      const elevation = viewState.snapshot && viewState.snapshot.battle && viewState.snapshot.battle.map
        && viewState.snapshot.battle.map.elevations && viewState.snapshot.battle.map.elevations[unit.y]
        ? (viewState.snapshot.battle.map.elevations[unit.y][unit.x] || 0)
        : 0;
      const effectiveRange = CombatService.getEffectiveWeaponRange(unit, {
        attackerTileType: tileType,
        attackerElevation: elevation,
        defenderElevation: elevation
      });
      return `무기 ${effectiveRange.rangeMin}-${effectiveRange.rangeMax}`;
    }

    return `${skill.rangeMin}-${skill.rangeMax}`;
  }

  function buildBattleSkillCardMarkup(unit, skill) {
    const performance = SkillsService.getSkillPerformance(unit, skill);
    const cooldownText = skill.cooldownRemaining > 0 ? `재사용 ${skill.cooldownRemaining}턴` : "사용 가능";
    const terrainReady = BattleService.canUseSkillOnCurrentTerrain(unit, skill);
    const terrainText = skill.requiredTileTypes && skill.requiredTileTypes.length
      ? skill.requiredTileTypes.map((tile) => getTerrainLabel(tile)).join(" / ")
      : "제한 없음";
    const disabled = skill.cooldownRemaining > 0 || !terrainReady ? "disabled" : "";
    const disabledReason = skill.cooldownRemaining > 0
      ? "재사용 대기 중"
      : !terrainReady
        ? "현재 지형에서 사용 불가"
        : "즉시 사용 가능";
    const targetLabel = skill.targetType === "self"
      ? "자신"
      : skill.targetType === "ally"
        ? (Number(skill.rangeMin || 0) === 0 ? "자신/아군" : "아군")
        : "적";

    return [
      `<article class="modal-card battle-skill-card ${disabled ? "is-disabled" : "is-ready"}">`,
      '  <div class="battle-skill-card-top">',
      '    <div class="battle-skill-copy">',
      `      <div class="item-title-row"><strong>${skill.name}</strong><span>${targetLabel}</span></div>`,
      `      <p>${skill.description}</p>`,
      "    </div>",
      '    <div class="battle-skill-state">',
      `      <span class="meta-pill ${skill.cooldownRemaining > 0 ? "is-muted" : "is-cyan"}">${cooldownText}</span>`,
      `      <span class="meta-pill is-violet">Lv.${skill.skillLevel}</span>`,
      "    </div>",
      "  </div>",
      '  <div class="battle-briefing-metrics battle-skill-metrics">',
      buildBattleBriefingMetric("대상", targetLabel, "cyan"),
      buildBattleBriefingMetric("사거리", getSkillRangeSummary(unit, skill), "gold"),
      buildBattleBriefingMetric("지형", terrainText, terrainReady ? "muted" : "crimson"),
      buildBattleBriefingMetric("상태", disabledReason, disabled ? "crimson" : "violet"),
      performance ? buildBattleBriefingMetric("현재 성능", performance.currentSummary, "gold") : "",
      "  </div>",
      performance && performance.formulaLines && performance.formulaLines.length
        ? `  <div class="battle-skill-notes">${performance.formulaLines.map((line) => `<p>${line}</p>`).join("")}</div>`
        : "",
      `  <div class="button-row"><button class="secondary-button small-button" type="button" data-skill-id="${skill.id}" ${disabled}>선택</button></div>`,
      "</article>"
    ].filter(Boolean).join("");
  }

  function openSkillModal(unitId) {
    const snapshot = viewState.snapshot;
    const unit = snapshot.battle.units.find((entry) => entry.id === unitId);
    const skills = BattleService.getActiveSkills(unit);
    const body = [
      '<div class="battle-skill-modal">',
      '  <section class="battle-result-hero battle-skill-hero">',
      '    <span class="battle-result-kicker">Skill Loadout</span>',
      `    <strong>${unit.name} 액티브 스킬</strong>`,
      `    <p>${unit.className} / 장착 액티브 ${skills.length}개. 전투 중 즉시 사용할 스킬을 선택합니다.</p>`,
      "  </section>",
      '  <div class="modal-list battle-skill-list">'
    ];

    if (!skills.length) {
      body.push('<article class="modal-card battle-skill-card is-disabled"><p>사용 가능한 액티브 스킬이 없습니다.</p></article>');
    } else {
      skills.forEach((skill) => {
        body.push(buildBattleSkillCardMarkup(unit, skill));
      });
    }

    body.push("  </div>");
    body.push("</div>");
    showModal(body.join(""), {
      panelClass: "modal-panel-wide battle-skill-modal-panel",
      bodyClass: "battle-skill-modal-body"
    });

    getElement("battle-modal-host").querySelectorAll("[data-skill-id]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          BattleService.setPendingSkill(button.dataset.skillId);
          viewState.config.showToast("스킬 대상을 선택하세요.");
          closeModal();
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });
  }

  function openStatsModal(unitId) {
    const snapshot = viewState.snapshot;
    const unit = snapshot.saveData.roster.find((entry) => entry.id === unitId);
    const draft = getProgressionDraft(unitId);
    const previewUnit = StatsService.previewUnitWithStatDraft(unit, draft.stats);
    const basePrimaryStats = StatsService.getPrimaryStats(unit);
    const previewPrimaryStats = StatsService.getPrimaryStats(previewUnit);
    const spentStats = countDraftStats(draft);
    const spentSkills = countDraftSkills(draft);
    const remainingStatPoints = Math.max(0, (unit.statPoints || 0) - spentStats);
    const remainingSkillPoints = Math.max(0, (unit.skillPoints || 0) - spentSkills);
    const learnableSkills = SkillsService.getLearnableSkills(unit);
    const learnableActiveSkills = SkillsService.getLearnableActiveSkills(unit);
    const body = [
      `<h3>${unit.name} 성장 배분</h3>`,
      `<p>남은 포인트: 스탯 ${remainingStatPoints} / 스킬 ${remainingSkillPoints}</p>`,
      "<p>히든 전투 수치는 눈에 보이지 않지만, 아래 기본 스탯과 스킬 배분에 따라 내부에서 자동으로 상승합니다.</p>",
      '<div class="detail-stats">',
      StatsService.PRIMARY_STATS.map((statName) => (
        buildPrimaryStatMetaPill(statName, previewPrimaryStats[statName], draft.stats && draft.stats[statName])
      )).join(""),
      "</div>",
      '<div class="modal-list">'
    ];

    StatsService.ALLOCATABLE_STATS.forEach((statName) => {
      body.push([
        '<article class="modal-card compact-card">',
        `  <div class="stat-row"><strong>${StatsService.PRIMARY_STAT_LABELS[statName]}</strong><span>${basePrimaryStats[statName]} -> ${previewPrimaryStats[statName]}</span></div>`,
        `  <p>${StatsService.getPrimaryStatDescription(statName)}</p>`,
        `  <button class="secondary-button small-button" type="button" data-stat-draft="${statName}" ${remainingStatPoints <= 0 || previewPrimaryStats[statName] >= StatsService.STAT_LIMITS[statName] ? "disabled" : ""}>+1 예약</button>`,
        "</article>"
      ].join(""));
    });

    learnableSkills.forEach((skill) => {
      const isDrafted = draft.skillIds.includes(skill.id);
      body.push([
        `<article class="modal-card progression-skill-card ${isDrafted ? "is-drafted" : ""}">`,
        `  <div class="item-title-row"><strong>${skill.name}</strong><span>PASSIVE</span></div>`,
        `  <p>${skill.description}</p>`,
        '  <div class="button-row">',
        `    <button class="${isDrafted ? "primary-button" : "secondary-button"} small-button" type="button" data-skill-draft="${skill.id}" ${!isDrafted && remainingSkillPoints <= 0 ? "disabled" : ""}>${isDrafted ? "선택 취소" : "학습 예약"}</button>`,
        "  </div>",
        "</article>"
      ].join(""));
    });

    learnableActiveSkills.forEach((skill) => {
      const isDrafted = draft.skillIds.includes(skill.id);
      body.push([
        `<article class="modal-card progression-skill-card ${isDrafted ? "is-drafted" : ""}">`,
        `  <div class="item-title-row"><strong>${skill.name}</strong><span>ACTIVE</span></div>`,
        `  <p>${skill.description}</p>`,
        '  <div class="button-row">',
        `    <button class="${isDrafted ? "primary-button" : "secondary-button"} small-button" type="button" data-skill-draft="${skill.id}" ${!isDrafted && remainingSkillPoints <= 0 ? "disabled" : ""}>${isDrafted ? "선택 취소" : "학습 예약"}</button>`,
        "  </div>",
        "</article>"
      ].join(""));
    });

    if (spentStats || spentSkills) {
      body.push([
        '<article class="modal-card">',
        `  <p>확정 대기: 스탯 ${spentStats} / 스킬 ${spentSkills}</p>`,
        '  <div class="button-row">',
        '    <button class="primary-button small-button" type="button" data-progression-confirm="true">성장 확정</button>',
        '    <button class="ghost-button small-button" type="button" data-progression-cancel="true">예약 취소</button>',
        "  </div>",
        "</article>"
      ].join(""));
    }

    body.push("</div>");
    showModal(body.join(""));

    getElement("battle-modal-host").querySelectorAll("[data-stat-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const statName = button.dataset.statDraft;
          const activeDraft = getProgressionDraft(unitId);

          if (Math.max(0, (unit.statPoints || 0) - countDraftStats(activeDraft)) <= 0) {
            throw new Error("남은 스탯 포인트가 없습니다.");
          }

          if ((previewPrimaryStats[statName] || 0) >= StatsService.STAT_LIMITS[statName]) {
            throw new Error("이 스탯은 더 이상 올릴 수 없습니다.");
          }

          activeDraft.stats[statName] += 1;
          openStatsModal(unitId);
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });

    getElement("battle-modal-host").querySelectorAll("[data-skill-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const activeDraft = getProgressionDraft(unitId);
          const index = activeDraft.skillIds.indexOf(button.dataset.skillDraft);

          if (index >= 0) {
            activeDraft.skillIds.splice(index, 1);
          } else {
            if (Math.max(0, (unit.skillPoints || 0) - countDraftSkills(activeDraft)) <= 0) {
              throw new Error("남은 스킬 포인트가 없습니다.");
            }

            activeDraft.skillIds.push(button.dataset.skillDraft);
          }

          openStatsModal(unitId);
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });

    getElement("battle-modal-host").querySelectorAll("[data-progression-confirm]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const activeDraft = getProgressionDraft(unitId);
          BattleService.applyProgressionDraft(unitId, activeDraft.stats, activeDraft.skillIds);
          clearProgressionDraft(unitId);
          viewState.config.showToast(`${unit.name}의 성장 예약을 확정했습니다.`);
          openStatsModal(unitId);
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });

    getElement("battle-modal-host").querySelectorAll("[data-progression-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        clearProgressionDraft(unitId);
        openStatsModal(unitId);
      });
    });
  }

  function showModal(bodyMarkup, options) {
    closeModal();

    const nextOptions = options || {};
    const host = getElement("battle-modal-host");
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = [
      `<div class="modal-panel${nextOptions.panelClass ? ` ${nextOptions.panelClass}` : ""}">`,
      '  <button id="modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      `  <div class="modal-body${nextOptions.bodyClass ? ` ${nextOptions.bodyClass}` : ""}">${bodyMarkup}</div>`,
      "</div>"
    ].join("");

    host.appendChild(modal);
    viewState.modal = modal;

    getElement("modal-close-button").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (modal.dataset.locked === "true") {
        return;
      }

      if (event.target === modal) {
        closeModal();
      }
    });
  }

  function closeModal() {
    if (viewState.modal && viewState.modal.dataset.locked === "true") {
      return;
    }

    if (viewState.modal) {
      viewState.modal.remove();
      viewState.modal = null;
    }
  }

  global.BattleView = {
    init,
    startNewBattle,
    resumeBattle
  };
})(window);
