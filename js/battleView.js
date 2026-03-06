/* 역할: 전투 화면 렌더링, 3D 맵 카메라, 인벤토리/스탯 UI, 전투 입력 이벤트를 담당한다. */

(function attachBattleView(global) {
  const BattleService = global.BattleService;
  const InventoryService = global.InventoryService;
  const SkillsService = global.SkillsService;
  const StatsService = global.StatsService;

  const viewState = {
    config: null,
    snapshot: null,
    sessionRef: null,
    aiRunning: false,
    statusAnnounced: null,
    modal: null,
    drag: null,
    audioContext: null,
    scenePulseTimer: null,
    overlayTimer: null,
    cutInTimer: null
  };

  function getElement(id) {
    return document.getElementById(id);
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
      '    <button id="rotate-left-button" class="ghost-button" type="button">Q 회전</button>',
      '    <button id="rotate-right-button" class="ghost-button" type="button">E 회전</button>',
      '    <button id="reset-camera-button" class="ghost-button" type="button">시점 리셋</button>',
      "  </div>",
      '  <div class="battle-toolbar-actions">',
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
    getElement("rotate-left-button").addEventListener("click", () => rotateCamera(-90));
    getElement("rotate-right-button").addEventListener("click", () => rotateCamera(90));
    getElement("reset-camera-button").addEventListener("click", resetCamera);
    getElement("battle-end-turn-button").addEventListener("click", handleEndTurn);
    getElement("battle-return-menu-button").addEventListener("click", handleReturnMenu);

    const scene = getElement("battle-scene");
    scene.addEventListener("mousedown", beginDrag);
    scene.addEventListener("mousemove", continueDrag);
    scene.addEventListener("mouseup", endDrag);
    scene.addEventListener("mouseleave", endDrag);
    scene.addEventListener("wheel", handleZoom, { passive: false });

    document.addEventListener("keydown", handleKeydown);
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

  function playUiTone(type) {
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
    const preset = presets[type] || presets.hit;

    oscillator.type = preset.wave;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, preset.endFrequency), now + preset.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);
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
        showBattleCutIn("defeat", "Collapse", "전열 붕괴", "주인공이 쓰러졌습니다");
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
      playUiTone("heal");
      pulseBattleScene("heal", "HEAL");
      return;
    }

    if (/부여|강화|전장 규칙|유물 획득/.test(joined)) {
      playUiTone(/유물 획득|전리품|아이템 획득/.test(joined) ? "loot" : "buff");
      pulseBattleScene(/유물 획득|전리품|아이템 획득/.test(joined) ? "loot" : "buff", /유물 획득|전리품|아이템 획득/.test(joined) ? "LOOT" : "BUFF");
      return;
    }

    if (/피해|격파|빗나갔습니다/.test(joined)) {
      playUiTone("hit");
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

    if (event.key === "q" || event.key === "Q") {
      rotateCamera(-90);
    }

    if (event.key === "e" || event.key === "E") {
      rotateCamera(90);
    }

    if (event.key === "Escape") {
      closeModal();
    }
  }

  function getLiveSession() {
    return viewState.sessionRef || viewState.config.getSession();
  }

  function rotateCamera(delta) {
    const session = getLiveSession();
    session.settings.cameraRotation = ((session.settings.cameraRotation || 0) + delta + 360) % 360;
    persistSession(session.saveData, session.settings);
    render(viewState.snapshot);
  }

  function resetCamera() {
    const session = getLiveSession();
    session.settings.cameraRotation = 0;
    session.settings.cameraPitch = 58;
    session.settings.cameraYaw = -45;
    session.settings.cameraZoom = 1;
    persistSession(session.saveData, session.settings);
    render(viewState.snapshot);
  }

  function beginDrag(event) {
    const session = getLiveSession();

    if (!session.settings.freeCameraEnabled) {
      return;
    }

    viewState.drag = {
      startX: event.clientX,
      startY: event.clientY,
      pitch: session.settings.cameraPitch || 58,
      yaw: session.settings.cameraYaw || -45
    };
  }

  function continueDrag(event) {
    if (!viewState.drag) {
      return;
    }

    const session = getLiveSession();
    const nextYaw = viewState.drag.yaw + (event.clientX - viewState.drag.startX) * 0.3;
    const nextPitch = viewState.drag.pitch - (event.clientY - viewState.drag.startY) * 0.18;
    session.settings.cameraYaw = nextYaw;
    session.settings.cameraPitch = Math.max(32, Math.min(78, nextPitch));
    render(viewState.snapshot);
  }

  function endDrag() {
    if (!viewState.drag) {
      return;
    }

    viewState.drag = null;
    const session = getLiveSession();
    persistSession(session.saveData, session.settings);
  }

  function handleZoom(event) {
    event.preventDefault();

    const session = getLiveSession();
    const currentZoom = session.settings.cameraZoom || 1;
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    session.settings.cameraZoom = Math.max(0.75, Math.min(1.35, currentZoom + delta));
    render(viewState.snapshot);
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

  function renderToolbar(snapshot) {
    const endTurnButton = getElement("battle-end-turn-button");

    if (!endTurnButton) {
      return;
    }

    if (snapshot && snapshot.battle && snapshot.battle.victoryCondition === "support_complete") {
      endTurnButton.textContent = snapshot.battle.pendingChoice ? "보상 선택 필요" : "다음 층 진행";
      endTurnButton.disabled = snapshot.battle.status !== "in_progress" || !!snapshot.battle.pendingChoice;
      return;
    }

    endTurnButton.textContent = "턴 종료";
    endTurnButton.disabled = !snapshot || !snapshot.battle || snapshot.battle.phase !== "player" || snapshot.battle.status !== "in_progress";
  }

  function renderTurnInfo(snapshot) {
    const target = getElement("turn-info");

    if (!snapshot || !snapshot.battle) {
      target.textContent = "전투가 시작되지 않았습니다.";
      return;
    }

    const alliesAlive = snapshot.battle.units.filter((unit) => unit.team === "ally" && unit.alive).length;
    const enemiesAlive = snapshot.battle.units.filter((unit) => unit.team === "enemy" && unit.alive).length;
    const eliteCount = snapshot.battle.units.filter((unit) => unit.team === "enemy" && unit.alive && unit.isElite).length;
    const selectedUnit = getSelectedUnit(snapshot);
    const bossUnit = snapshot.battle.bossUnitId
      ? snapshot.battle.units.find((unit) => unit.id === snapshot.battle.bossUnitId)
      : null;
    const endlessCurrentRun = snapshot.battle.stageId === "endless-rift" && snapshot.saveData
      ? BattleService.getEndlessCurrentRunSummary(snapshot.saveData)
      : null;
    const activeChain = endlessCurrentRun && endlessCurrentRun.chainState ? endlessCurrentRun.chainState : null;

    target.textContent = [
      `스테이지: ${snapshot.battle.stageName || snapshot.battle.stageId || "-"}`,
      `상태: ${snapshot.battle.status}`,
      `층 유형: ${formatFloorType(snapshot.battle.floorType)}`,
      `페이즈: ${snapshot.battle.phase === "player" ? "아군 턴" : "적 턴"}`,
      `턴 수: ${snapshot.battle.turnNumber}`,
      `목표: ${snapshot.battle.objective}`,
      `진행: ${BattleService.getVictoryProgressText()}`,
      `전장 규칙: ${snapshot.battle.specialRule ? `${snapshot.battle.specialRule.name} - ${snapshot.battle.specialRule.description}` : "없음"}`,
      `정예 반응: ${eliteCount > 0 ? `${eliteCount}체` : "없음"}`,
      `보스: ${bossUnit && bossUnit.alive ? `${bossUnit.name} (${bossUnit.hp}/${bossUnit.maxHp})` : "격파됨 또는 없음"}`,
      `클리어 보상: ${snapshot.battle.rewardGold || 0}G`,
      `아군 생존: ${alliesAlive}`,
      `적 생존: ${enemiesAlive}`,
      `선택 유닛: ${selectedUnit ? selectedUnit.name : "없음"}`,
      `연출: ${snapshot.battle.lastEventText || "없음"}`,
      `엔드리스 유물: ${(snapshot.saveData && snapshot.saveData.endless && snapshot.saveData.endless.relicIds || []).length}`,
      activeChain ? `연속 사건: ${activeChain.name}` : "",
      endlessCurrentRun ? `현재 런: 처치 ${endlessCurrentRun.enemiesDefeated} / 정예 ${endlessCurrentRun.eliteDefeated} / 피해 ${endlessCurrentRun.damageDealt}` : ""
    ].filter(Boolean).join("\n");
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

    const weaponText = selectedUnit.weapon
      ? `${selectedUnit.weapon.name} / 위력 ${selectedUnit.weapon.might} / 명중 ${selectedUnit.weapon.hit} / 사거리 ${selectedUnit.weapon.rangeMin}-${selectedUnit.weapon.rangeMax} / 내구 ${selectedUnit.weapon.uses}`
      : "무기 없음";
    const activeSkillText = BattleService.getActiveSkills(selectedUnit)
      .map((skill) => `${skill.name}(${skill.cooldownRemaining > 0 ? `${skill.cooldownRemaining}턴` : "준비"})`)
      .join(", ") || "없음";

    const actionButtons = selectedUnit.team === "ally"
      ? (() => {
          const locked = selectedUnit.acted || snapshot.battle.phase !== "player" ? "disabled" : "";
          return [
            '<div class="unit-action-row">',
            `  <button class="secondary-button small-button" type="button" data-action="wait" ${locked}>대기</button>`,
            `  <button class="ghost-button small-button" type="button" data-action="undo" ${snapshot.ui.pendingMove ? "" : "disabled"}>이동 취소</button>`,
            `  <button class="ghost-button small-button" type="button" data-action="skill" ${locked}>스킬</button>`,
            `  <button class="ghost-button small-button" type="button" data-action="item" ${locked}>소모품</button>`,
            '  <button class="ghost-button small-button" type="button" data-action="inventory">장착/인벤토리</button>',
            '  <button class="ghost-button small-button" type="button" data-action="stats">스탯 분배</button>',
            "</div>"
          ].join("");
        })()
      : "";

    target.innerHTML = [
      `<div class="unit-summary ${selectedUnit.team}">`,
      `  <strong>${selectedUnit.name}${selectedUnit.isBoss ? " ★" : selectedUnit.isElite ? " ◆" : ""}</strong> <span>${selectedUnit.className}${selectedUnit.bossTitle ? ` / ${selectedUnit.bossTitle}` : selectedUnit.eliteTitle ? ` / ${selectedUnit.eliteTitle}` : ""}</span>`,
      `  <p>Lv.${selectedUnit.level} / EXP ${selectedUnit.exp} / HP ${selectedUnit.hp}/${selectedUnit.maxHp}</p>`,
      `  <p>STR ${selectedUnit.str} / SKL ${selectedUnit.skl} / SPD ${selectedUnit.spd} / DEF ${selectedUnit.def} / MOV ${selectedUnit.mov}</p>`,
      `  <p>정예 특성: ${selectedUnit.eliteTraitName ? `${selectedUnit.eliteTraitName} - ${selectedUnit.eliteTraitDescription}` : "없음"}</p>`,
      `  <p>무기: ${weaponText}</p>`,
      `  <p>스킬: ${SkillsService.describeSkills(selectedUnit)}</p>`,
      `  <p>액티브: ${SkillsService.describeActiveSkills(selectedUnit)}</p>`,
      `  <p>쿨다운: ${activeSkillText}</p>`,
      `  <p>상태 효과: ${formatStatusEffects(selectedUnit)}</p>`,
      `  <p>남은 스탯 포인트: ${selectedUnit.statPoints || 0}</p>`,
      actionButtons,
      "</div>"
    ].join("");

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
      BattleService.waitSelectedUnit();
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

    const eliteUnits = snapshot.battle.units.filter((unit) => unit.team === "enemy" && unit.alive && unit.isElite);
    const relicCount = (snapshot.saveData && snapshot.saveData.endless && snapshot.saveData.endless.relicIds || []).length;
    const endlessCurrentRun = snapshot.battle.stageId === "endless-rift" && snapshot.saveData
      ? BattleService.getEndlessCurrentRunSummary(snapshot.saveData)
      : null;
    const activeChain = endlessCurrentRun && endlessCurrentRun.chainState ? endlessCurrentRun.chainState : null;
    const chips = [`<span class="flavor-chip floor">${formatFloorType(snapshot.battle.floorType)}</span>`];

    if (snapshot.battle.specialRule) {
      chips.push(`<span class="flavor-chip rule">${snapshot.battle.specialRule.name}</span>`);
    }

    if (eliteUnits.length) {
      chips.push(`<span class="flavor-chip elite">정예 ${eliteUnits.length}</span>`);
    }

    if (snapshot.battle.stageId === "endless-rift") {
      chips.push(`<span class="flavor-chip relic">유물 ${relicCount}</span>`);

      if (endlessCurrentRun) {
        chips.push(`<span class="flavor-chip run">처치 ${endlessCurrentRun.enemiesDefeated}</span>`);
      }

      if (activeChain) {
        chips.push(`<span class="flavor-chip chain">${activeChain.name}</span>`);
      }
    }

    target.classList.remove("hidden");
    target.innerHTML = [
      '<div class="flavor-main">',
      `  <strong>${snapshot.battle.stageName}</strong>`,
      `  <span>${snapshot.battle.specialRule ? snapshot.battle.specialRule.description : snapshot.battle.lastEventText || snapshot.battle.objective}</span>`,
      "</div>",
      `<div class="flavor-chips">${chips.join("")}</div>`
    ].join("");
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
    const pitch = settings.cameraPitch || 58;
    const yaw = (settings.cameraYaw || -45) + (settings.cameraRotation || 0);
    const zoom = settings.cameraZoom || 1;

    camera.style.transform = `rotateX(${pitch}deg) rotateZ(${yaw}deg) scale(${zoom})`;
    grid.style.setProperty("--grid-cols", snapshot.battle.map.width);
    grid.style.setProperty("--grid-rows", snapshot.battle.map.height);
    grid.classList.toggle("grid-hidden", settings.gridVisible === false);
    scene.className = [
      "battle-scene",
      `scene-${snapshot.battle.floorType || "combat"}`,
      snapshot.battle.stageId === "endless-rift" ? "scene-endless" : "scene-story",
      snapshot.battle.specialRule ? "scene-rule" : "",
      snapshot.battle.units.some((unit) => unit.alive && unit.isElite) ? "scene-elite" : ""
    ].filter(Boolean).join(" ");

    const tileMarkup = [];
    const selectedUnit = getSelectedUnit(snapshot);

    for (let y = 0; y < snapshot.battle.map.height; y += 1) {
      for (let x = 0; x < snapshot.battle.map.width; x += 1) {
        const unit = snapshot.battle.units.find((entry) => entry.alive && entry.x === x && entry.y === y);
        const tileType = snapshot.battle.map.tiles[y][x];
        const classes = ["battle-tile", `tile-${tileType}`];
        const isReachable = snapshot.ui.reachableTiles.some((tile) => tile.x === x && tile.y === y);
        const isAttack = snapshot.ui.attackTiles.some((tile) => tile.x === x && tile.y === y);
        const isSkillTarget = unit && snapshot.ui.skillTargetIds.includes(unit.id);

        if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
          classes.push("is-selected");
        }

        if (isReachable) {
          classes.push("is-reachable");
        }

        if (isAttack) {
          classes.push("is-attack");
        }

        if (isSkillTarget) {
          classes.push("is-skill-target");
        }

        if (unit) {
          classes.push(unit.team === "ally" ? "has-ally" : "has-enemy");
        }

        tileMarkup.push([
          `<button class="${classes.join(" ")}" type="button" data-x="${x}" data-y="${y}">`,
          `  <span class="tile-elevation"></span>`,
          `  <span class="tile-top"></span>`,
          unit ? `  <span class="tile-unit ${unit.team}${unit.isBoss ? " boss" : ""}${unit.isElite ? " elite" : ""}">${unit.name}${unit.isBoss ? "★" : unit.isElite ? "◆" : ""}<small>${unit.hp}</small></span>` : "",
          tileType === "forest" ? '  <span class="tile-deco">숲</span>' : "",
          tileType === "wall" ? '  <span class="tile-deco">벽</span>' : "",
          "</button>"
        ].join(""));
      }
    }

    grid.innerHTML = tileMarkup.join("");
    grid.querySelectorAll(".battle-tile").forEach((button) => {
      button.addEventListener("click", () => {
        BattleService.handleTileSelection(Number(button.dataset.x), Number(button.dataset.y));
      });
    });
  }

  function renderStatusBanner(snapshot) {
    const banner = getElement("battle-status-banner");

    if (!snapshot || !snapshot.battle || snapshot.battle.status === "in_progress") {
      banner.classList.add("hidden");
      banner.innerHTML = "";
      return;
    }

    banner.classList.remove("hidden");
    const rewardItems = ((snapshot.battle.rewardHistory || []).map((item) => item.name).join(", ")) || "없음";
    const endlessSummary = snapshot.battle.stageId === "endless-rift" && snapshot.saveData
      ? BattleService.getEndlessRunSummary(snapshot.saveData)
      : null;
    const endlessStats = endlessSummary && endlessSummary.stats ? endlessSummary.stats : null;
    banner.innerHTML = [
      `<strong>${snapshot.battle.status === "victory" ? "승리" : "패배"}</strong>`,
      `<span>${snapshot.battle.status === "victory" ? `${snapshot.battle.rewardGold || 0}G를 획득하고 다음 스테이지가 개방되었습니다.` : "주인공이 쓰러졌습니다."}</span>`,
      snapshot.battle.status === "victory" ? `<span>획득 아이템: ${rewardItems}</span>` : "",
      endlessSummary ? `<span>균열 기록: ${endlessSummary.floor}층 / 유물 ${endlessSummary.relicNames.length}개 / 최고 ${endlessSummary.bestFloor}층</span>` : "",
      endlessStats ? `<span>런 통계: 적 ${endlessStats.enemiesDefeated} / 정예 ${endlessStats.eliteDefeated} / 보스 ${endlessStats.bossesDefeated} / 피해 ${endlessStats.damageDealt} / 획득 ${endlessStats.goldEarned}G</span>` : "",
      '<div class="unit-action-row">',
      '  <button id="banner-menu-button" class="secondary-button small-button" type="button">메뉴로</button>',
      '  <button id="banner-restart-button" class="ghost-button small-button" type="button">새 전투</button>',
      "</div>"
    ].join("");

    getElement("banner-menu-button").addEventListener("click", handleReturnMenu);
    getElement("banner-restart-button").addEventListener("click", () => {
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

  function maybeShowSupportChoice(snapshot) {
    if (!snapshot || !snapshot.battle || !snapshot.battle.pendingChoice || snapshot.battle.status !== "in_progress") {
      return;
    }

    if (!snapshot.battle.cutsceneSeen || viewState.modal) {
      return;
    }

    const body = [
      `<h3>${snapshot.battle.pendingChoice.title}</h3>`,
      '<div class="modal-list">'
    ];

    (snapshot.battle.pendingChoice.choices || []).forEach((choice) => {
      const suffix = snapshot.battle.pendingChoice.type === "relic"
        ? "유물"
        : snapshot.battle.pendingChoice.type === "shop"
          ? `${choice.price}G`
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

    viewState.aiRunning = true;
    BattleService.endPlayerTurn();
    await BattleService.runEnemyPhase();
    viewState.aiRunning = false;
  }

  function handleReturnMenu() {
    closeModal();
    BattleService.leaveBattle();
    viewState.aiRunning = false;
    viewState.sessionRef = null;
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
      const canEquip = InventoryService.canEquip(unit, item);
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
    showModal(body.join(""));

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

  function openSkillModal(unitId) {
    const snapshot = viewState.snapshot;
    const unit = snapshot.battle.units.find((entry) => entry.id === unitId);
    const skills = BattleService.getActiveSkills(unit);
    const body = [
      `<h3>${unit.name} 액티브 스킬</h3>`,
      '<div class="modal-list">'
    ];

    if (!skills.length) {
      body.push('<article class="modal-card"><p>사용 가능한 액티브 스킬이 없습니다.</p></article>');
    } else {
      skills.forEach((skill) => {
        const cooldownText = skill.cooldownRemaining > 0 ? `재사용 ${skill.cooldownRemaining}턴` : "사용 가능";
        const disabled = skill.cooldownRemaining > 0 ? "disabled" : "";
        const targetLabel = skill.targetType === "self"
          ? "자신"
          : skill.targetType === "ally"
            ? "아군"
            : "적";

        body.push([
          '<article class="modal-card">',
          `  <div class="item-title-row"><strong>${skill.name}</strong><span>${cooldownText}</span></div>`,
          `  <p>${skill.description}</p>`,
          `  <p>대상: ${targetLabel}</p>`,
          `  <button class="secondary-button small-button" type="button" data-skill-id="${skill.id}" ${disabled}>선택</button>`,
          "</article>"
        ].join(""));
      });
    }

    body.push("</div>");
    showModal(body.join(""));

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
    const body = [
      `<h3>${unit.name} 스탯 분배</h3>`,
      `<p>남은 포인트: ${unit.statPoints || 0}</p>`,
      '<div class="modal-list">'
    ];

    StatsService.ALLOCATABLE_STATS.forEach((statName) => {
      body.push([
        '<article class="modal-card compact-card">',
        `  <div class="stat-row"><strong>${statName}</strong><span>${unit[statName]}</span></div>`,
        `  <button class="secondary-button small-button" type="button" data-stat-name="${statName}">+1</button>`,
        "</article>"
      ].join(""));
    });

    body.push("</div>");
    showModal(body.join(""));

    getElement("battle-modal-host").querySelectorAll("[data-stat-name]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          BattleService.allocateStat(unitId, button.dataset.statName);
          viewState.config.showToast(`${unit.name}의 ${button.dataset.statName} 상승`);
          openStatsModal(unitId);
        } catch (error) {
          viewState.config.showToast(error.message, true);
        }
      });
    });
  }

  function showModal(bodyMarkup) {
    closeModal();

    const host = getElement("battle-modal-host");
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.innerHTML = [
      '<div class="modal-panel">',
      '  <button id="modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      `  <div class="modal-body">${bodyMarkup}</div>`,
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
