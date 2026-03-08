/* 역할: 인증 UI, 회원가입/로그인 처리, 사용자 세션 로딩, 메인 메뉴 렌더링을 담당한다. */

(function attachAuthApp(global) {
  const StorageService = global.StorageService;
  const CryptoService = global.CryptoService;
  const BattleService = global.BattleService;
  const BattleView = global.BattleView;
  const InventoryService = global.InventoryService;
  const SkillsService = global.SkillsService;
  const StatsService = global.StatsService;
  const TavernService = global.TavernService;
  const MAX_SORTIE_SIZE = 5;
  const SHOP_PAGE_SIZE = 3;
  const INVENTORY_PAGE_SIZE = 3;

  const appState = {
    currentUserId: null,
    saveData: null,
    settings: null,
    selectedMenuUnitId: null,
    activeMainPanel: "party",
    inventoryView: {
      sort: "rarity",
      type: "all",
      rarity: "all",
      equipped: "all",
      page: 1
    },
    shopView: {
      page: 1
    },
    progressionDrafts: {},
    equipmentModal: {
      unitId: null,
      hoveredItemId: null,
      hoveredSlotKey: null,
      dragItemId: null
    },
    skillModal: {
      unitId: null,
      hoveredSkillId: null,
      dragSkillId: null
    },
    detailModal: {
      type: null,
      id: null
    },
    activeStageTab: "all",
    cachedUnitDetailUnitId: null,
    cachedUnitDetailMarkup: "",
    toastTimer: null,
    menuClockTimer: null
  };

  const screenIds = [
    "screen-start",
    "screen-login",
    "screen-register",
    "screen-main-menu",
    "screen-battle"
  ];

  function getElement(elementId) {
    return document.getElementById(elementId);
  }

  function showScreen(screenId) {
    screenIds.forEach((id) => {
      const element = getElement(id);
      element.classList.toggle("active", id === screenId);
    });
  }

  function showToast(message, isError) {
    const toast = getElement("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    toast.style.borderColor = isError ? "rgba(255, 111, 145, 0.72)" : "rgba(135, 247, 195, 0.42)";

    if (appState.toastTimer) {
      clearTimeout(appState.toastTimer);
    }

    appState.toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2600);
  }

  const MAIN_PANEL_META = {
    party: { eyebrow: "Party", title: "파티 관리" },
    tavern: { eyebrow: "Tavern", title: "주점 / 모험가 길드" },
    inventory: { eyebrow: "Inventory", title: "공유 인벤토리" },
    shop: { eyebrow: "Shop", title: "보급 상점" },
    settings: { eyebrow: "Settings", title: "전투 설정" },
    codex: { eyebrow: "Codex", title: "보스 드롭 도감" }
  };

  function getLeaderUnit(saveData) {
    if (!saveData || !saveData.roster || !saveData.roster.length) {
      return null;
    }

    return saveData.roster.find((unit) => unit.id === saveData.leaderUnitId) || saveData.roster[0] || null;
  }

  function formatRankBadge(rank) {
    const rankMeta = TavernService.getRankMeta(rank);
    return `${rankMeta.label} / ${rankMeta.title}`;
  }

  function formatRemainingRefresh(nextRefreshAt) {
    if (!nextRefreshAt) {
      return "갱신 정보 없음";
    }

    const remainingMs = Math.max(0, new Date(nextRefreshAt).getTime() - Date.now());
    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  }

  function syncTavernState(showRefreshToast) {
    if (!appState.saveData || !TavernService) {
      return null;
    }

    const syncResult = TavernService.syncTavern(appState.saveData);

    if (syncResult && syncResult.changed && appState.currentUserId) {
      appState.saveData = StorageService.setUserSave(appState.currentUserId, appState.saveData);

      if (showRefreshToast) {
        showToast("주점 명단이 새로 교체되었습니다.");
      }
    }

    return syncResult ? syncResult.tavern : null;
  }

  function normalizeUserId(rawUserId) {
    return rawUserId.trim().toLowerCase();
  }

  function validateUserId(userId) {
    return /^[a-z0-9_]{4,20}$/.test(userId);
  }

  function validatePassword(password) {
    return typeof password === "string" && password.length >= 8;
  }

  function renderSessionChrome() {
    const badge = getElement("global-user-badge");
    const logoutButton = getElement("global-logout-button");
    const continueButton = getElement("continue-session-button");

    if (appState.currentUserId) {
      badge.textContent = `${appState.currentUserId} · 마이페이지`;
      badge.title = "클릭하면 마이페이지가 열립니다.";
      badge.classList.remove("hidden");
      logoutButton.classList.remove("hidden");
      continueButton.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
      logoutButton.classList.add("hidden");
      continueButton.classList.add("hidden");
    }
  }

  function formatSaveSummary(saveData) {
    if (!saveData) {
      return "세이브 데이터가 없습니다.";
    }

    const campaign = saveData.campaign || {};
    const selectedStage = BattleService.getStageCatalog(saveData).find((stage) => stage.selected);
    const endlessRun = BattleService.getEndlessRunSummary(saveData);
    const endlessCurrentRun = BattleService.getEndlessCurrentRunSummary(saveData);
    const leaderUnit = getLeaderUnit(saveData);
    const lastResult = campaign.lastResult
      ? `${campaign.lastResult.stageName} / ${campaign.lastResult.result === "victory" ? "승리" : "패배"}`
      : "없음";

    return [
      `리더: ${leaderUnit ? `${leaderUnit.name} (${leaderUnit.guildRank || "D"})` : "없음"}`,
      `출전: ${(saveData.selectedPartyIds || []).length}/${MAX_SORTIE_SIZE} / 골드 ${saveData.partyGold}G`,
      `진행: ${selectedStage ? selectedStage.name : saveData.stageId} / ${saveData.stageStatus}`,
      `클리어 ${(campaign.clearedStageIds || []).length} / 최근 ${lastResult}`,
      `무한균열: ${endlessRun ? `${endlessRun.floor}층 ${endlessRun.result === "defeat" ? "패배" : "돌파"}` : "기록 없음"}`,
      `현재 런: ${endlessCurrentRun ? `${endlessCurrentRun.highestFloor}층 / 피해 ${endlessCurrentRun.damageDealt}` : "없음"}`
    ].join("\n");
  }

  function formatPlayerSummary(userId, saveData, settings) {
    if (!userId) {
      return "로그인된 사용자가 없습니다.";
    }

    const leadUnit = getLeaderUnit(saveData);
    const selectedStage = saveData ? BattleService.getStageCatalog(saveData).find((stage) => stage.selected) : null;
    const endlessCurrentRun = saveData ? BattleService.getEndlessCurrentRunSummary(saveData) : null;

    return [
      `아이디: ${userId}`,
      `대표: ${leadUnit ? `${leadUnit.name} (${leadUnit.className})` : "없음"}`,
      `출격지: ${selectedStage ? selectedStage.name : (saveData ? saveData.stageId : "미정")}`,
      `균열 최고 ${saveData && saveData.endless ? saveData.endless.bestFloor : 1}층 / 유물 ${saveData && saveData.endless && saveData.endless.relicIds ? saveData.endless.relicIds.length : 0}`,
      `현재 런: ${endlessCurrentRun ? `${endlessCurrentRun.floorsCleared}층 돌파 / 정예 ${endlessCurrentRun.eliteDefeated}` : "없음"}`
    ].join("\n");
  }

  function formatStageFocus(stage) {
    if (!stage) {
      return "선택된 스테이지가 없습니다.";
    }

    return [
      `${stage.order}. ${stage.name}`,
      `${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"} / ${stage.available ? "개방" : "잠김"}`,
      `목표: ${stage.victoryLabel}`,
      `임무: ${stage.objective}`,
      `보상: ${stage.rewardGold}G`,
      `상태: ${stage.inProgress ? "진행 중" : stage.cleared ? "클리어" : "준비"}`
    ].join("\n");
  }

  function formatShopStatus(saveData) {
    if (!saveData) {
      return "상점 정보를 불러올 수 없습니다.";
    }

    const consumables = (saveData.inventory || []).filter((item) => InventoryService.isConsumable(item)).length;

    return [
      `보유 골드: ${saveData.partyGold}G`,
      `인벤토리 수: ${(saveData.inventory || []).length}개`,
      `소모품 수: ${consumables}개`
    ].join("\n");
  }

  function getSelectedStageMeta() {
    if (!appState.saveData) {
      return null;
    }

    return BattleService.getStageCatalog(appState.saveData).find((stage) => stage.selected) || null;
  }

  function setActiveMainPanel(panelKey) {
    if (appState.equipmentModal.unitId && panelKey !== "party") {
      closeEquipmentModal();
    }

    if (appState.skillModal.unitId && panelKey !== "party") {
      closeSkillModal();
    }

    if (appState.detailModal.type) {
      closeDetailModal();
    }

    appState.activeMainPanel = MAIN_PANEL_META[panelKey] ? panelKey : "party";

    Object.keys(MAIN_PANEL_META).forEach((key) => {
      const panel = getElement(`menu-panel-${key}`);
      if (panel) {
        panel.classList.toggle("active", key === appState.activeMainPanel);
      }
    });

    document.querySelectorAll("[data-menu-panel]").forEach((button) => {
      button.classList.toggle("active", button.dataset.menuPanel === appState.activeMainPanel);
    });

    const meta = MAIN_PANEL_META[appState.activeMainPanel];
    getElement("menu-detail-eyebrow").textContent = meta.eyebrow;
    getElement("menu-detail-title").textContent = meta.title;
  }

  function getSelectedMenuUnit() {
    if (!appState.saveData || !appState.saveData.roster) {
      return null;
    }

    const selectedUnit = appState.saveData.roster.find((unit) => unit.id === appState.selectedMenuUnitId);
    return selectedUnit || getLeaderUnit(appState.saveData) || appState.saveData.roster[0] || null;
  }

  function ensureSelectedMenuUnit() {
    const selectedUnit = getSelectedMenuUnit();
    appState.selectedMenuUnitId = selectedUnit ? selectedUnit.id : null;
    return selectedUnit;
  }

  function getUnitNameById(unitId) {
    const unit = appState.saveData && appState.saveData.roster
      ? appState.saveData.roster.find((entry) => entry.id === unitId)
      : null;

    return unit ? unit.name : "없음";
  }

  function getSelectedPartyIds() {
    return (appState.saveData && appState.saveData.selectedPartyIds) || [];
  }

  function isUnitSelectedForSortie(unitId) {
    return getSelectedPartyIds().includes(unitId);
  }

  function toggleSortieUnit(unitId) {
    const selectedPartyIds = getSelectedPartyIds().slice();
    const isSelected = selectedPartyIds.includes(unitId);

    if (isSelected) {
      appState.saveData.selectedPartyIds = selectedPartyIds.filter((id) => id !== unitId);
      return false;
    }

    if (selectedPartyIds.length >= MAX_SORTIE_SIZE) {
      throw new Error(`출전 파티는 최대 ${MAX_SORTIE_SIZE}명까지 선택할 수 있습니다.`);
    }

    selectedPartyIds.push(unitId);
    appState.saveData.selectedPartyIds = selectedPartyIds;
    return true;
  }

  function getEquipmentModalHost() {
    return getElement("menu-modal-host");
  }

  function closeEquipmentModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    appState.equipmentModal.unitId = null;
    appState.equipmentModal.hoveredItemId = null;
    appState.equipmentModal.hoveredSlotKey = null;
    appState.equipmentModal.dragItemId = null;
  }

  function closeSkillModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    appState.skillModal.unitId = null;
    appState.skillModal.hoveredSkillId = null;
    appState.skillModal.dragSkillId = null;
  }

  function closeDetailModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    appState.detailModal.type = null;
    appState.detailModal.id = null;
  }

  function closeMenuModals() {
    closeEquipmentModal();
    closeSkillModal();
    closeDetailModal();
  }

  function buildUnitStatPill(label, effectiveValue, baseValue) {
    const bonus = effectiveValue - baseValue;
    return `<span class="meta-pill ${bonus > 0 ? "is-gold" : ""}">${label} ${effectiveValue}${bonus > 0 ? ` (+${bonus})` : ""}</span>`;
  }

  function buildPrimaryStatPill(statName, baseValue, previewValue, options) {
    const nextOptions = options || {};
    const label = StatsService.PRIMARY_STAT_LABELS[statName] || statName.toUpperCase();
    const delta = previewValue - baseValue;
    const equipmentBonus = Number(nextOptions.equipmentBonus || 0);
    const draftDelta = Number(nextOptions.draftDelta || 0);
    const bonusParts = [];

    if (equipmentBonus > 0) {
      bonusParts.push(`장비 +${equipmentBonus}`);
    }

    if (draftDelta > 0) {
      bonusParts.push(`예약 +${draftDelta}`);
    }

    return `<span class="meta-pill ${delta > 0 ? "is-preview-up" : ""}">${label} ${previewValue}${bonusParts.length ? ` (${bonusParts.join(" / ")})` : ""}</span>`;
  }

  function buildEquippedItemBadge(item) {
    const rarity = InventoryService.getRarityMeta(item.rarity);
    const slotLabel = InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot);
    return `<span class="meta-pill rarity-${item.rarity}">${slotLabel}: ${item.name} (${rarity.label})</span>`;
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
    if (!appState.progressionDrafts[unitId]) {
      appState.progressionDrafts[unitId] = createEmptyProgressionDraft();
    }

    return appState.progressionDrafts[unitId];
  }

  function clearProgressionDraft(unitId) {
    if (!unitId) {
      return;
    }

    delete appState.progressionDrafts[unitId];
  }

  function countDraftStats(draft) {
    return StatsService.PRIMARY_STATS.reduce((sum, statName) => sum + Number((draft.stats && draft.stats[statName]) || 0), 0);
  }

  function countDraftSkills(draft) {
    return Array.isArray(draft.skillIds) ? draft.skillIds.length : 0;
  }

  function toggleDraftSkill(unit, skillId) {
    const draft = getProgressionDraft(unit.id);
    const index = draft.skillIds.indexOf(skillId);

    if (index >= 0) {
      draft.skillIds.splice(index, 1);
      return false;
    }

    if ((unit.skillPoints || 0) - countDraftSkills(draft) <= 0) {
      throw new Error("남은 스킬 포인트가 없습니다.");
    }

    draft.skillIds.push(skillId);
    return true;
  }

  function applyProgressionDraft(unitId) {
    const unit = getSelectedMenuUnit();
    const draft = getProgressionDraft(unitId);
    const spentStats = countDraftStats(draft);
    const spentSkills = countDraftSkills(draft);

    if (!unit || (!spentStats && !spentSkills)) {
      return unit;
    }

    if (spentStats) {
      StatsService.applyStatDraft(appState.saveData, unitId, draft.stats);
    }

    if (spentSkills) {
      draft.skillIds.forEach((skillId) => {
        SkillsService.learnSkill(unit, skillId);
      });
    }

    clearProgressionDraft(unitId);
    return unit;
  }

  function buildKnownSkillBadge(skill, isActive, options) {
    const nextOptions = options || {};
    const badgeParts = [`${isActive ? "액티브" : "패시브"}`, skill.name];

    if (isActive && skill.skillLevel) {
      badgeParts.push(`Lv.${skill.skillLevel}`);
    }

    if (nextOptions.slotLabel) {
      badgeParts.push(nextOptions.slotLabel);
    }

    return `<span class="meta-pill ${isActive ? "is-cyan" : ""} ${nextOptions.isEquipped ? "is-gold" : ""}">${badgeParts.join(" · ")}</span>`;
  }

  function buildDraftableSkillCard(skill, unit, isActive, isDrafted, remainingSkillPoints) {
    const cardClasses = ["inventory-card", "progression-skill-card"];

    if (isDrafted) {
      cardClasses.push("is-drafted");
    }

    return [
      `<article class="${cardClasses.join(" ")}">`,
      `  <div class="item-title-row"><strong class="card-title">${skill.name}</strong><span class="card-subtitle">${isActive ? "ACTIVE" : "PASSIVE"}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${isActive ? "is-cyan" : "is-gold"}">${isActive ? "액티브" : "패시브"}</span>`,
      `    <span class="meta-pill">개방 Lv.${skill.unlockLevel}</span>`,
      `    <span class="meta-pill ${isDrafted ? "is-preview-up" : "is-muted"}">${isDrafted ? "확정 대기" : "미학습"}</span>`,
      "  </div>",
      `  <p>${skill.description}</p>`,
      '  <div class="button-row">',
      `    <button class="${isDrafted ? "primary-button" : "secondary-button"} small-button" type="button" data-menu-skill-draft="${skill.id}" ${!isDrafted && remainingSkillPoints <= 0 ? "disabled" : ""}>${isDrafted ? "선택 취소" : `${unit.name}에게 학습`}</button>`,
      "  </div>",
      "</article>"
    ].join("");
  }

  function getSkillTargetLabel(skill) {
    if (!skill) {
      return "대상 없음";
    }

    if (skill.targetType === "self") {
      return "자신";
    }

    if (skill.targetType === "ally") {
      if (Number(skill.rangeMin || 0) === 0) {
        return "자신/아군";
      }

      return "아군";
    }

    return "적";
  }

  function getSkillRangeLabel(skill) {
    if (!skill) {
      return "사거리 없음";
    }

    if (skill.useWeaponRange) {
      return "무기 사거리 연동";
    }

    return `${skill.rangeMin}-${skill.rangeMax}칸`;
  }

  function getSkillTerrainLabel(skill) {
    if (!skill || !skill.requiredTileTypes || !skill.requiredTileTypes.length) {
      return "지형 제한 없음";
    }

    return skill.requiredTileTypes.map((tile) => (
      tile === "hill" ? "고지" : tile === "forest" ? "숲" : tile
    )).join(" / ");
  }

  function getSkillSlotLabel(slotIndex) {
    return `슬롯 ${slotIndex + 1}`;
  }

  function buildSkillDetailMarkup(unit, skillId) {
    if (!unit) {
      return "<p>스킬 정보를 표시할 수 없습니다.</p>";
    }

    const fallbackSkill = SkillsService.getActiveSkillLoadout(unit).find(Boolean)
      || SkillsService.getActiveSkillsForUnit(unit)[0]
      || SkillsService.getSkillsForUnit(unit)[0]
      || null;
    const skill = skillId
      ? SkillsService.getSkillDefinition(unit, skillId)
      : fallbackSkill;

    if (!skill) {
      return [
        `<div class="item-title-row"><strong class="card-title">${unit.name} 스킬 상세</strong><span class="card-subtitle">${unit.className}</span></div>`,
        "  <p>장착하거나 확인할 스킬이 없습니다.</p>"
      ].join("");
    }

    const detailedSkill = skill.skillType ? skill : (SkillsService.getActiveSkillsForUnit(unit).find((entry) => entry.id === skill.id)
      || SkillsService.getSkillsForUnit(unit).find((entry) => entry.id === skill.id)
      || skill);
    const performance = SkillsService.getSkillPerformance(unit, detailedSkill);
    const equippedSlotIndex = (unit.equippedActiveSkillIds || []).indexOf(detailedSkill.id);

    return [
      `<div class="item-title-row"><strong class="card-title">${detailedSkill.name}</strong><span class="card-subtitle">${detailedSkill.skillType === "active" ? "ACTIVE" : "PASSIVE"}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${detailedSkill.skillType === "active" ? "is-cyan" : "is-gold"}">${detailedSkill.skillType === "active" ? "액티브" : "패시브"}</span>`,
      detailedSkill.skillType === "active" ? `    <span class="meta-pill">Lv.${detailedSkill.skillLevel} / 최대 ${detailedSkill.maxSkillLevel}</span>` : "",
      detailedSkill.skillType === "active" && equippedSlotIndex >= 0 ? `    <span class="meta-pill is-gold">${getSkillSlotLabel(equippedSlotIndex)}</span>` : "",
      `    <span class="meta-pill">개방 Lv.${detailedSkill.unlockLevel}</span>`,
      detailedSkill.sourceClassName && detailedSkill.sourceClassName !== "special" ? `    <span class="meta-pill is-muted">${detailedSkill.sourceClassName}</span>` : "",
      "  </div>",
      `  <p>${detailedSkill.description}</p>`,
      detailedSkill.skillType === "active" ? `  <p>대상: ${getSkillTargetLabel(detailedSkill)} / 사거리: ${getSkillRangeLabel(detailedSkill)} / 재사용 ${detailedSkill.cooldown}턴</p>` : "",
      detailedSkill.skillType === "active" ? `  <p>지형 조건: ${getSkillTerrainLabel(detailedSkill)}</p>` : "",
      performance ? `  <p>현재 성능: ${performance.currentSummary}</p>` : "",
      performance ? performance.formulaLines.map((line) => `  <p>${line}</p>`).join("") : "",
      detailedSkill.canLevelUp ? "  <p>현재 레벨 기준으로 더 강화할 수 있습니다.</p>" : "",
      detailedSkill.skillType === "active" && !detailedSkill.canLevelUp && detailedSkill.skillLevel >= detailedSkill.maxSkillLevel
        ? `  <p>현재 레벨에서 가능한 최대 스킬 레벨입니다.</p>`
        : ""
    ].filter(Boolean).join("");
  }

  function buildUnitStatSummary(unit) {
    return [
      buildUnitStatPill("HP", unit.maxHp, unit.maxHp),
      buildUnitStatPill("ATK", unit.str, unit.str),
      buildUnitStatPill("ACC", unit.skl, unit.skl),
      buildUnitStatPill("SPD", unit.spd, unit.spd),
      buildUnitStatPill("DEF", unit.def, unit.def),
      buildUnitStatPill("MOV", unit.mov, unit.mov)
    ].join("");
  }

  function buildInventoryItemDetailMarkup(item) {
    const rarity = InventoryService.getRarityMeta(item.rarity);
    const ownerText = item.equippedBy
      ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}`
      : "미장착";

    return [
      `<div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
      `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
      InventoryService.isEquipment(item) ? '    <span class="meta-pill is-gold">장착 대상 선택 후 바로 장착 창으로 이동</span>' : "",
      "  </div>",
      `  <p>${InventoryService.describeItem(item)}</p>`,
      InventoryService.formatStatBonusLine(item) !== "추가 능력치 없음" ? `  <p>추가 능력치: ${InventoryService.formatStatBonusLine(item)}</p>` : "",
      item.affixes && item.affixes.length ? `  <p>옵션: ${item.affixes.map((affix) => `${affix.label} (${affix.description})`).join(" / ")}</p>` : "",
      item.description ? `  <p>${item.description}</p>` : ""
    ].filter(Boolean).join("");
  }

  function buildEquipTargetPickerMarkup(item) {
    const roster = (appState.saveData && appState.saveData.roster) || [];
    const compatibleTypeLabel = InventoryService.getTypeLabel(item.type || item.slot);

    return [
      `<div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${compatibleTypeLabel}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill rarity-${item.rarity}">${InventoryService.getRarityMeta(item.rarity).label}</span>`,
      `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${item.equippedBy ? `${getUnitNameById(item.equippedBy)} 장착 중` : "미장착"}</span>`,
      "  </div>",
      '  <p>장착할 캐릭터를 고르면 해당 캐릭터의 장착 관리 창이 열립니다.</p>',
      ...roster.map((unit) => {
        const canEquip = InventoryService.canEquip(unit, item);
        const isSelected = appState.selectedMenuUnitId === unit.id;
        return [
          `  <article class="inventory-card compact-card ${canEquip ? "" : "locked"}">`,
          '    <div>',
          `      <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
          `      <div class="inventory-meta"><span class="meta-pill">Lv.${unit.level}</span><span class="meta-pill ${isUnitSelectedForSortie(unit.id) ? "is-cyan" : "is-muted"}">${isUnitSelectedForSortie(unit.id) ? "출전 중" : "후방 대기"}</span><span class="meta-pill ${isSelected ? "is-gold" : "is-muted"}">${isSelected ? "현재 선택" : "선택 가능"}</span></div>`,
          "    </div>",
          `    <button class="${canEquip ? "primary-button" : "ghost-button"} small-button" type="button" data-equip-target-unit="${unit.id}" ${canEquip ? "" : "disabled"}>${canEquip ? "이 캐릭터로 열기" : "장착 불가"}</button>`,
          "  </article>"
        ].join("");
      })
    ].join("");
  }

  function buildShopProductDetailMarkup(product) {
    const rarity = InventoryService.getRarityMeta(product.rarity);

    return [
      `<div class="item-title-row"><strong class="card-title">${product.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill">${InventoryService.getTypeLabel(product.type || product.slot)}</span>`,
      `    <span class="meta-pill is-gold">${product.price}G</span>`,
      `    <span class="meta-pill ${appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "is-cyan" : "is-muted"}">${appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "구매 가능" : "골드 부족"}</span>`,
      "  </div>",
      `  <p>${InventoryService.describeItem(product)}</p>`,
      product.description ? `  <p>${product.description}</p>` : "",
      InventoryService.formatStatBonusLine(product) !== "추가 능력치 없음" ? `  <p>추가 능력치: ${InventoryService.formatStatBonusLine(product)}</p>` : ""
    ].filter(Boolean).join("");
  }

  function buildTavernCandidateDetailMarkup(candidate) {
    const unit = candidate.unit;
    const rankClass = `rank-${String(candidate.guildRank || "D").toLowerCase().replace("+", "plus")}`;
    const classProfile = SkillsService.getClassProfile(unit);
    const signaturePassive = candidate.signaturePassiveId
      ? SkillsService.getSkillDefinition(unit, candidate.signaturePassiveId)
      : null;

    return [
      `<div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${rankClass}">${candidate.guildRank}</span>`,
      `    <span class="meta-pill">${candidate.rankTitle}</span>`,
      `    <span class="meta-pill">Lv.${unit.level}</span>`,
      `    <span class="meta-pill is-gold">${candidate.hireCost}G</span>`,
      signaturePassive ? '    <span class="meta-pill is-cyan">고유 패시브 보유</span>' : "",
      candidate.recruitedAt ? '    <span class="meta-pill is-cyan">영입 완료</span>' : "",
      "  </div>",
      `  <p>${classProfile.role} / ${classProfile.summary}</p>`,
      `  <div class="detail-stats">${buildUnitStatSummary(unit)}</div>`,
      `  <p>시작 장비: ${candidate.startingWeapon.name}</p>`,
      signaturePassive ? `  <p>고유 패시브: ${signaturePassive.name} - ${signaturePassive.description}</p>` : "",
      `  <p>패시브: ${SkillsService.describeSkills(unit)}</p>`,
      `  <p>액티브: ${SkillsService.describeActiveSkills(unit)}</p>`,
      `  <p>운용 강점: ${classProfile.strengths}</p>`,
      `  <p>주의점: ${classProfile.caution}</p>`
    ].filter(Boolean).join("");
  }

  function buildUnitFullDetailMarkup(unit) {
    if (!unit || !appState.saveData) {
      return "<p>캐릭터 정보를 표시할 수 없습니다.</p>";
    }

    const draft = getProgressionDraft(unit.id);
    const previewUnit = StatsService.previewUnitWithStatDraft(unit, draft.stats);
    const effectivePreviewUnit = InventoryService.getEffectiveUnitStats(appState.saveData, previewUnit);
    const equippedItems = InventoryService.getEquippedItems(appState.saveData, unit.id)
      .map((item) => buildEquippedItemBadge(item))
      .join("");
    const classProfile = SkillsService.getClassProfile(unit);
    const basePrimaryStats = StatsService.getPrimaryStats(unit);
    const previewPrimaryStats = StatsService.getPrimaryStats(effectivePreviewUnit);
    const equipmentBonus = effectivePreviewUnit && effectivePreviewUnit.equipmentBonus ? effectivePreviewUnit.equipmentBonus.primary || {} : {};
    const spentStats = countDraftStats(draft);
    const spentSkills = countDraftSkills(draft);
    const remainingStatPoints = Math.max(0, (unit.statPoints || 0) - spentStats);
    const remainingSkillPoints = Math.max(0, (unit.skillPoints || 0) - spentSkills);
    const learnedSkills = SkillsService.getSkillsForUnit(unit);
    const learnedActiveSkills = SkillsService.getActiveSkillsForUnit(unit);
    const equippedActiveSkills = SkillsService.getActiveSkillLoadout(unit);
    const promotionOptions = SkillsService.getPromotionOptions(unit);
    const lockedPromotions = SkillsService.PROMOTION_TREE[unit.className] || [];
    let promotionSummary = "전직 완료";

    if (promotionOptions.length) {
      promotionSummary = promotionOptions.map((promotion) => `${promotion.className} 전직 가능`).join(" / ");
    } else if (lockedPromotions.length) {
      promotionSummary = lockedPromotions
        .map((promotion) => `${promotion.className} Lv.${promotion.unlockLevel} 필요`)
        .join(" / ");
    } else if ((unit.promotionHistory || []).length) {
      const latestPromotion = unit.promotionHistory[unit.promotionHistory.length - 1];
      promotionSummary = `${latestPromotion.from} -> ${latestPromotion.to}`;
    }

    return [
      `<div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(unit.guildRank || "D")}</span>`,
      `    <span class="meta-pill">Lv.${unit.level}</span>`,
      `    <span class="meta-pill">EXP ${unit.exp}</span>`,
      `    <span class="meta-pill is-gold">스탯 ${remainingStatPoints}</span>`,
      `    <span class="meta-pill is-cyan">스킬 ${remainingSkillPoints}</span>`,
      `    <span class="meta-pill ${isUnitSelectedForSortie(unit.id) ? "is-cyan" : "is-muted"}">${isUnitSelectedForSortie(unit.id) ? "출전 중" : "후방 대기"}</span>`,
      `    <span class="meta-pill ${appState.saveData.leaderUnitId === unit.id ? "is-gold" : "is-muted"}">${appState.saveData.leaderUnitId === unit.id ? "리더" : "일반"}</span>`,
      "  </div>",
      '  <div class="detail-stats">',
      StatsService.PRIMARY_STATS.map((statName) => (
        `    ${buildPrimaryStatPill(statName, basePrimaryStats[statName], previewPrimaryStats[statName], {
          equipmentBonus: equipmentBonus[statName] || 0,
          draftDelta: Number((draft.stats && draft.stats[statName]) || 0)
        })}`
      )).join(""),
      "  </div>",
      '  <div class="detail-stats">',
      `    <span class="meta-pill">HP ${effectivePreviewUnit.maxHp}${effectivePreviewUnit.equipmentBonus && effectivePreviewUnit.equipmentBonus.legacy && effectivePreviewUnit.equipmentBonus.legacy.maxHp ? ` (+${effectivePreviewUnit.equipmentBonus.legacy.maxHp} 장비)` : ""}</span>`,
      `    <span class="meta-pill">MOV ${effectivePreviewUnit.mov}${effectivePreviewUnit.equipmentBonus && effectivePreviewUnit.equipmentBonus.legacy && effectivePreviewUnit.equipmentBonus.legacy.mov ? ` (+${effectivePreviewUnit.equipmentBonus.legacy.mov} 장비)` : ""}</span>`,
      `    <span class="meta-pill ${spentStats ? "is-preview-up" : "is-muted"}">예약 스탯 ${spentStats}</span>`,
      `    <span class="meta-pill ${spentSkills ? "is-preview-up" : "is-muted"}">예약 스킬 ${spentSkills}</span>`,
      "  </div>",
      `  <p>병종 역할: ${classProfile.role} / ${classProfile.summary}</p>`,
      `  <p>운용 강점: ${classProfile.strengths}</p>`,
      `  <p>상성 가이드: ${classProfile.matchup}</p>`,
      `  <p>주의점: ${classProfile.caution}</p>`,
      `  <p>장착 중: ${equippedItems || "없음"}</p>`,
      `  <p>전직: ${promotionSummary}</p>`,
      `  <p>습득 패시브: ${learnedSkills.length ? learnedSkills.map((skill) => skill.name).join(", ") : "없음"}</p>`,
      learnedSkills.length ? `  <div class="detail-stats">${learnedSkills.map((skill) => buildKnownSkillBadge(skill, false)).join("")}</div>` : "",
      `  <p>장착 액티브: ${equippedActiveSkills.filter(Boolean).length ? equippedActiveSkills.filter(Boolean).map((skill) => skill.name).join(", ") : "없음"}</p>`,
      `  <div class="detail-stats">${equippedActiveSkills.map((skill, index) => (
        skill
          ? buildKnownSkillBadge(skill, true, { isEquipped: true, slotLabel: getSkillSlotLabel(index) })
          : `<span class="meta-pill is-muted">${getSkillSlotLabel(index)} 비어 있음</span>`
      )).join("")}</div>`,
      `  <p>보유 액티브: ${learnedActiveSkills.length ? learnedActiveSkills.map((skill) => `${skill.name} Lv.${skill.skillLevel}`).join(", ") : "없음"}</p>`
    ].filter(Boolean).join("");
  }

  function buildStageDetailMarkup(stage) {
    const isEndless = stage.id === "endless-rift";
    const statusText = stage.inProgress ? "진행 중" : stage.cleared ? "클리어" : "준비";
    const availabilityText = stage.available ? "개방" : "잠김";
    const focusLines = [
      `${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"} / ${availabilityText}`,
      `승리 조건: ${stage.victoryLabel}`,
      `임무 목표: ${stage.objective}`,
      isEndless
        ? "층마다 랜덤 지형, 적 편성, 정예/휴식 이벤트가 바뀝니다."
        : "고정 지형 전장으로 임무 목표에 맞춰 파티를 준비합니다.",
      `보상 골드: ${stage.rewardGold}G`,
      `현재 상태: ${statusText}`,
      stage.selected ? "현재 출격 대상으로 지정된 스테이지입니다." : "선택하면 출격 대상이 이 스테이지로 바뀝니다."
    ];

    return [
      `<div class="item-title-row"><strong class="card-title">${stage.order}. ${stage.name}</strong><span class="card-subtitle">${availabilityText}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${stage.category === "main" ? "is-gold" : "is-cyan"}">${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"}</span>`,
      `    <span class="meta-pill">${stage.victoryLabel}</span>`,
      `    <span class="meta-pill is-gold">${stage.rewardGold}G</span>`,
      `    <span class="meta-pill ${stage.cleared ? "is-cyan" : "is-muted"}">${stage.cleared ? "클리어" : "미클리어"}</span>`,
      `    <span class="meta-pill ${stage.inProgress ? "is-crimson" : "is-muted"}">${statusText}</span>`,
      "  </div>",
      ...focusLines.map((line) => `  <p>${line}</p>`)
    ].join("");
  }

  function buildRewardCodexDetailMarkup(reward) {
    const rarity = InventoryService.getRarityMeta(reward.rewardRarity);
    const statusText = reward.discovered ? "기록 완료" : "미발견";

    return [
      `<div class="item-title-row"><strong class="card-title">${reward.discovered ? reward.rewardName : "???"}</strong><span class="card-subtitle">${reward.discovered ? rarity.label : "미발견"}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill">${reward.stageName}</span>`,
      `    <span class="meta-pill is-crimson">보스 ${reward.bossName}</span>`,
      `    <span class="meta-pill">${reward.rewardType}</span>`,
      `    <span class="meta-pill ${reward.discovered ? "is-cyan" : "is-muted"}">${statusText}</span>`,
      "  </div>",
      `  <p>${reward.discovered ? reward.rewardDescription : "해당 스테이지의 보스를 격파하면 보상 정보가 도감에 기록됩니다."}</p>`,
      reward.discovered
        ? "  <p>획득한 적이 있거나 식별한 장비이므로, 등급과 효과가 도감에 노출됩니다.</p>"
        : "  <p>아직 보상이 확인되지 않았습니다. 해당 보스의 고정 드롭을 확보하면 상세 성능이 공개됩니다.</p>"
    ].join("");
  }

  function buildProfileDetailMarkup() {
    if (!appState.currentUserId || !appState.saveData) {
      return "<p>사용자 정보를 불러올 수 없습니다.</p>";
    }

    return [
      `<div class="item-title-row"><strong class="card-title">${appState.currentUserId}</strong><span class="card-subtitle">마이페이지</span></div>`,
      `  <p>${formatPlayerSummary(appState.currentUserId, appState.saveData, appState.settings).replace(/\n/g, "<br>")}</p>`,
      `  <p>${formatSaveSummary(appState.saveData).replace(/\n/g, "<br>")}</p>`
    ].join("");
  }

  function getDetailModalConfig() {
    const type = appState.detailModal.type;
    const id = appState.detailModal.id;

    if (!type || !id || !appState.saveData) {
      return null;
    }

    if (type === "inventory") {
      const item = InventoryService.getItemById(appState.saveData, id);

      if (!item) {
        return null;
      }

      const isEquipmentItem = InventoryService.isEquipment(item);
      const selectedUnit = ensureSelectedMenuUnit();
      const canUse = selectedUnit ? InventoryService.isConsumable(item) : false;

      return {
        title: "아이템 상세",
        bodyMarkup: buildInventoryItemDetailMarkup(item),
        actions: [
          {
            id: "equip",
            label: "장착 대상 선택",
            className: "secondary-button",
            disabled: !isEquipmentItem,
            onClick() {
              openDetailModal("equip-target", item.id);
            }
          },
          {
            id: "use",
            label: "사용",
            className: "secondary-button",
            disabled: !selectedUnit || !canUse,
            onClick() {
              const result = InventoryService.applyConsumableToUnit(appState.saveData, selectedUnit, item.id);
              persistSession(appState.saveData, appState.settings);
              closeDetailModal();
              showToast(`${selectedUnit.name} 회복 +${result.healed}`);
            }
          },
          {
            id: "unequip",
            label: "해제",
            className: "ghost-button",
            disabled: !item.equippedBy,
            onClick() {
              const unequippedItem = InventoryService.unequipItem(appState.saveData, item.id);
              persistSession(appState.saveData, appState.settings);
              closeDetailModal();
              showToast(`${unequippedItem.name} 해제`);
            }
          }
        ]
      };
    }

    if (type === "equip-target") {
      const item = InventoryService.getItemById(appState.saveData, id);

      if (!item || !InventoryService.isEquipment(item)) {
        return null;
      }

      return {
        title: "장착 대상 선택",
        bodyMarkup: buildEquipTargetPickerMarkup(item),
        actions: []
      };
    }

    if (type === "shop") {
      const product = InventoryService.SHOP_CATALOG.find((entry) => entry.id === id);

      if (!product) {
        return null;
      }

      return {
        title: "보급 상점",
        bodyMarkup: buildShopProductDetailMarkup(product),
        actions: [
          {
            id: "buy",
            label: "구매",
            className: "primary-button",
            disabled: !appState.saveData || (appState.saveData.partyGold || 0) < product.price,
            onClick() {
              const purchasedItem = InventoryService.purchaseItem(appState.saveData, product.id);
              persistSession(appState.saveData, appState.settings);
              closeDetailModal();
              showToast(`${purchasedItem.name} 구매 완료`);
            }
          }
        ]
      };
    }

    if (type === "tavern") {
      const candidate = ((appState.saveData.tavern && appState.saveData.tavern.lineup) || []).find((entry) => entry.id === id);

      if (!candidate) {
        return null;
      }

      return {
        title: "모험가 정보",
        bodyMarkup: buildTavernCandidateDetailMarkup(candidate),
        actions: [
          {
            id: "recruit",
            label: candidate.recruitedAt ? "영입 완료" : "영입",
            className: "primary-button",
            disabled: !!candidate.recruitedAt || (appState.saveData.partyGold || 0) < (candidate.hireCost || 0),
            onClick() {
              const result = TavernService.recruitAdventurer(appState.saveData, candidate.id);
              appState.selectedMenuUnitId = result.unit.id;
              persistSession(appState.saveData, appState.settings);
              closeDetailModal();
              showToast(`${result.unit.name} 영입 완료`);
            }
          }
        ]
      };
    }

    if (type === "unit") {
      const unit = (appState.saveData.roster || []).find((entry) => entry.id === id);

      if (!unit) {
        return null;
      }

      const promotionOptions = SkillsService.getPromotionOptions(unit);

      return {
        title: "캐릭터 상세",
        bodyMarkup: appState.cachedUnitDetailUnitId === unit.id && appState.cachedUnitDetailMarkup
          ? appState.cachedUnitDetailMarkup
          : buildUnitFullDetailMarkup(unit),
        actions: []
      };
    }

    if (type === "profile") {
      return {
        title: "마이페이지",
        bodyMarkup: buildProfileDetailMarkup(),
        actions: []
      };
    }

    if (type === "stage") {
      const stage = BattleService.getStageCatalog(appState.saveData).find((entry) => entry.id === id);

      if (!stage) {
        return null;
      }

      return {
        title: "스테이지 상세",
        bodyMarkup: buildStageDetailMarkup(stage),
        actions: [
          {
            id: "select-stage",
            label: stage.selected ? "현재 선택됨" : "스테이지 선택",
            className: "primary-button",
            disabled: !stage.available || stage.selected,
            onClick() {
              const requiresAbandon =
                appState.saveData.stageStatus === "in_progress" &&
                appState.saveData.battleState &&
                appState.saveData.stageId !== stage.id;

              if (requiresAbandon && !global.confirm("진행 중인 전투를 포기하고 다른 스테이지를 선택하시겠습니까?")) {
                return;
              }

              const selectedStage = BattleService.selectCampaignStage(appState.saveData, stage.id, {
                abandonCurrentBattle: requiresAbandon
              });
              persistSession(appState.saveData, appState.settings);
              closeDetailModal();
              showToast(`${selectedStage.name} 선택`);
            }
          }
        ]
      };
    }

    if (type === "codex") {
      const reward = BattleService.getRewardCodex(appState.saveData).find((entry) => entry.stageId === id);

      if (!reward) {
        return null;
      }

      return {
        title: "보스 드롭 상세",
        bodyMarkup: buildRewardCodexDetailMarkup(reward),
        actions: []
      };
    }

    return null;
  }

  function renderDetailModal() {
    const host = getEquipmentModalHost();
    const config = getDetailModalConfig();

    if (!host || !config) {
      closeDetailModal();
      return;
    }

    host.innerHTML = [
      '<div class="modal-backdrop menu-modal-backdrop">',
      '  <div class="modal-panel menu-detail-modal-panel">',
      '    <button id="menu-detail-modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      '    <div class="modal-body menu-detail-modal-body">',
      `      <div class="item-title-row equipment-modal-header"><strong class="card-title">${config.title}</strong><span class="card-subtitle">클릭한 카드의 상세 정보</span></div>`,
      `      <section class="modal-card menu-detail-card">${config.bodyMarkup}</section>`,
      config.actions.length
        ? `      <div class="detail-actions menu-detail-actions">${config.actions.map((action) => (
          `<button class="${action.className} small-button" type="button" data-detail-action="${action.id}" ${action.disabled ? "disabled" : ""}>${action.label}</button>`
        )).join("")}</div>`
        : "",
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    const backdrop = host.querySelector(".menu-modal-backdrop");

    getElement("menu-detail-modal-close-button").addEventListener("click", closeDetailModal);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeDetailModal();
      }
    });

    host.querySelectorAll("[data-detail-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = config.actions.find((entry) => entry.id === button.dataset.detailAction);

        if (!action || action.disabled) {
          return;
        }

        try {
          action.onClick();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    if (appState.detailModal.type === "unit" || appState.detailModal.type === "equip-target") {
      const detailCard = host.querySelector(".menu-detail-card");

      if (detailCard) {
        detailCard.addEventListener("click", (event) => {
          if (appState.detailModal.type === "unit") {
            handleUnitDetailModalInteraction(event, String(appState.detailModal.id));
            return;
          }

          handleEquipTargetModalInteraction(event, String(appState.detailModal.id));
        });
      }
    }
  }

  function openDetailModal(type, id) {
    closeEquipmentModal();
    closeSkillModal();
    appState.detailModal.type = type;
    appState.detailModal.id = id;
    renderDetailModal();
  }

  function refreshUnitDetailModal(unitId) {
    renderMainMenu();
    openDetailModal("unit", unitId);
  }

  function handleUnitDetailModalInteraction(event, unitId) {
    const button = event.target.closest("button");
    const unit = (appState.saveData && appState.saveData.roster || []).find((entry) => entry.id === unitId);

    if (!button || !unit) {
      return;
    }

    if (button.dataset.openEquipment === "true") {
      closeDetailModal();
      openEquipmentModal(unit.id);
      return;
    }

    if (button.dataset.openSkillModal === "true") {
      closeDetailModal();
      openSkillModal(unit.id);
      return;
    }

    if (button.dataset.menuStatDraft) {
      const statName = button.dataset.menuStatDraft;
      const draft = getProgressionDraft(unit.id);
      const previewUnit = StatsService.previewUnitWithStatDraft(unit, draft.stats);
      const previewPrimaryStats = StatsService.getPrimaryStats(previewUnit);

      if (Math.max(0, (unit.statPoints || 0) - countDraftStats(draft)) <= 0) {
        showToast("남은 스탯 포인트가 없습니다.", true);
        return;
      }

      if ((previewPrimaryStats[statName] || 0) >= StatsService.STAT_LIMITS[statName]) {
        showToast("이 스탯은 더 이상 올릴 수 없습니다.", true);
        return;
      }

      draft.stats[statName] += 1;
      refreshUnitDetailModal(unit.id);
      return;
    }

    if (button.dataset.menuSkillDraft) {
      try {
        toggleDraftSkill(unit, button.dataset.menuSkillDraft);
        refreshUnitDetailModal(unit.id);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.unequipAll === "true") {
      (unit.equippedItemIds || []).slice().forEach((itemId) => {
        InventoryService.unequipItem(appState.saveData, itemId);
      });
      persistSession(appState.saveData, appState.settings);
      refreshUnitDetailModal(unit.id);
      showToast(`${unit.name}의 장비를 해제했습니다.`);
      return;
    }

    if (button.dataset.promoteClass) {
      try {
        const result = SkillsService.promoteUnit(unit, button.dataset.promoteClass);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(`${unit.name}: ${result.previousClassName} -> ${result.promotion.className}`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.progressionConfirm === "true") {
      try {
        const appliedUnit = applyProgressionDraft(unit.id);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(`${appliedUnit.name}의 성장 예약을 확정했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.progressionCancel === "true") {
      clearProgressionDraft(unit.id);
      refreshUnitDetailModal(unit.id);
      showToast("성장 예약을 취소했습니다.");
      return;
    }

    if (button.dataset.toggleSortie === "true") {
      try {
        const added = toggleSortieUnit(unit.id);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(added ? `${unit.name} 출전 등록` : `${unit.name} 후방 대기 전환`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.setLeader === "true") {
      try {
        TavernService.setLeader(appState.saveData, unit.id);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(`${unit.name}을(를) 파티 리더로 지정했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  function handleEquipTargetModalInteraction(event, itemId) {
    const button = event.target.closest("button[data-equip-target-unit]");
    const item = InventoryService.getItemById(appState.saveData, itemId);

    if (!button || !item || !InventoryService.isEquipment(item)) {
      return;
    }

    const unitId = String(button.dataset.equipTargetUnit || "");
    const unit = (appState.saveData && appState.saveData.roster || []).find((entry) => entry.id === unitId);

    if (!unit) {
      showToast("장착 대상을 찾을 수 없습니다.", true);
      return;
    }

    if (!InventoryService.canEquip(unit, item)) {
      showToast(`${unit.className}은 ${InventoryService.getTypeLabel(item.type || item.slot)}을(를) 장착할 수 없습니다.`, true);
      return;
    }

    appState.selectedMenuUnitId = unit.id;
    closeDetailModal();
    openEquipmentModal(unit.id, { initialItemId: item.id });
  }

  function buildEquipmentDetailMarkup(unit, item, slotKey) {
    if (!unit) {
      return "<p>장비 정보를 표시할 수 없습니다.</p>";
    }

    if (item) {
      const rarity = InventoryService.getRarityMeta(item.rarity);
      const ownerText = item.equippedBy ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}` : "미장착";
      const slotText = InventoryService.getCompatibleSlotKeys(item).map((key) => InventoryService.getSlotLabel(key)).join(" / ");
      return [
        `<div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
        `    <span class="meta-pill">${slotText || InventoryService.getSlotLabel(item.slot)}</span>`,
        `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
        "  </div>",
        `  <p>${InventoryService.describeItem(item)}</p>`,
        InventoryService.formatStatBonusLine(item) !== "추가 능력치 없음" ? `  <p>보너스: ${InventoryService.formatStatBonusLine(item)}</p>` : "",
        item.affixes && item.affixes.length ? `  <p>옵션: ${item.affixes.map((affix) => `${affix.label} (${affix.description})`).join(" / ")}</p>` : "",
        item.description ? `  <p>${item.description}</p>` : ""
      ].join("");
    }

    if (slotKey) {
      const loadout = InventoryService.getEquipmentLoadout(appState.saveData, unit.id);
      const slotMeta = InventoryService.getEquipSlotMeta(slotKey);
      const equippedItem = loadout[slotKey];
      return [
        `<div class="item-title-row"><strong class="card-title">${slotMeta ? slotMeta.label : slotKey}</strong><span class="card-subtitle">${equippedItem ? "장착됨" : "빈 슬롯"}</span></div>`,
        equippedItem
          ? `<p>${equippedItem.name}이(가) 장착되어 있습니다. 드래그로 다른 장비를 떨어뜨리거나 해제 버튼으로 비울 수 있습니다.</p>`
          : "<p>호환 장비를 드래그하거나 오른쪽 목록에서 더블클릭해 장착할 수 있습니다.</p>"
      ].join("");
    }

    const equippedItems = InventoryService.getEquippedItems(appState.saveData, unit.id);
    const effectiveUnit = InventoryService.getEffectiveUnitStats(appState.saveData, unit);
    const primaryStats = StatsService.getPrimaryStats(unit);
    const effectivePrimaryStats = StatsService.getPrimaryStats(effectiveUnit);
    const equipmentBonus = effectiveUnit && effectiveUnit.equipmentBonus ? effectiveUnit.equipmentBonus.primary || {} : {};

    return [
      `<div class="item-title-row"><strong class="card-title">${unit.name} 장비 상세</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '  <div class="detail-stats">',
      StatsService.PRIMARY_STATS.map((statName) => (
        `    ${buildPrimaryStatPill(statName, primaryStats[statName], effectivePrimaryStats[statName], { equipmentBonus: equipmentBonus[statName] || 0 })}`
      )).join(""),
      "  </div>",
      `<p>장착 수: ${equippedItems.length} / ${InventoryService.getEquipSlotLayout().length}</p>`,
      `<p>${equippedItems.length ? equippedItems.map((equippedItem) => `${InventoryService.getSlotLabel(equippedItem.equippedSlotKey)} ${equippedItem.name}`).join(" / ") : "장착된 장비가 없습니다."}</p>`
    ].join("");
  }

  function renderEquipmentDetailPanel(unit) {
    const detailTarget = getElement("menu-equipment-detail");

    if (!detailTarget) {
      return;
    }

    const hoveredItem = appState.equipmentModal.hoveredItemId
      ? InventoryService.getItemById(appState.saveData, appState.equipmentModal.hoveredItemId)
      : null;

    detailTarget.innerHTML = buildEquipmentDetailMarkup(unit, hoveredItem, appState.equipmentModal.hoveredSlotKey);
  }

  function renderEquipmentModal() {
    const host = getEquipmentModalHost();
    const unit = appState.saveData && appState.saveData.roster
      ? appState.saveData.roster.find((entry) => entry.id === appState.equipmentModal.unitId)
      : null;

    if (!host || !unit) {
      closeEquipmentModal();
      return;
    }

    const loadout = InventoryService.getEquipmentLoadout(appState.saveData, unit.id);
    const items = InventoryService.sortInventory(
      (appState.saveData.inventory || []).filter((item) => InventoryService.isEquipment(item) && InventoryService.canEquip(unit, item)),
      "equipped"
    );

    host.innerHTML = [
      '<div class="modal-backdrop menu-modal-backdrop">',
      '  <div class="modal-panel modal-panel-wide">',
      '    <button id="menu-modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      '    <div class="modal-body equipment-modal-body">',
      `      <div class="item-title-row equipment-modal-header"><strong class="card-title">${unit.name} 장착 관리</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '      <div class="equipment-modal-layout">',
      '        <section class="equipment-slot-column">',
      '          <h3>장비 슬롯</h3>',
      '          <div class="equipment-slot-grid">',
      InventoryService.getEquipSlotLayout().map((slotMeta) => {
        const item = loadout[slotMeta.key];
        const rarity = item ? InventoryService.getRarityMeta(item.rarity) : null;

        return [
          `<article class="inventory-card equipment-slot-card ${item ? `rarity-${item.rarity}` : "is-empty"}" data-equip-slot="${slotMeta.key}" data-slot-item-id="${item ? item.id : ""}">`,
          `  <div class="item-title-row"><strong class="card-title">${slotMeta.label}</strong><span class="card-subtitle">${item ? rarity.label : "EMPTY"}</span></div>`,
          `  <p>${item ? item.name : "장비 없음"}</p>`,
          '  <div class="inventory-meta">',
          `    <span class="meta-pill ${item ? "is-cyan" : "is-muted"}">${item ? InventoryService.getTypeLabel(item.type || item.slot) : "빈 슬롯"}</span>`,
          item ? `    <span class="meta-pill">${InventoryService.formatStatBonusLine(item)}</span>` : `    <span class="meta-pill is-muted">${slotMeta.accepts.map((entry) => InventoryService.getSlotLabel(entry)).join(" / ")}</span>`,
          "  </div>",
          item ? `  <button class="ghost-button small-button equipment-unequip-button" type="button" data-unequip-item="${item.id}">해제</button>` : "",
          "</article>"
        ].join("");
      }).join(""),
      "          </div>",
      "        </section>",
      '        <section class="equipment-inventory-column">',
      '          <div class="item-title-row">',
      '            <h3>보유 장비</h3>',
      '            <span class="meta-pill is-gold">더블클릭 또는 드래그</span>',
      "          </div>",
      items.length
        ? `          <div class="equipment-inventory-list">${items.map((item) => {
            const rarity = InventoryService.getRarityMeta(item.rarity);
            const ownerText = item.equippedBy ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}` : "미장착";
            const equipLabel = item.equippedBy === unit.id ? "재장착" : item.equippedBy ? "교체 장착" : "장착";

            return [
              `<article class="inventory-card equipment-item-card rarity-${item.rarity}" draggable="true" data-modal-item="${item.id}">`,
              `  <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
              '  <div class="inventory-meta">',
              `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
              `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
              "  </div>",
              `  <p>${InventoryService.describeItem(item)}</p>`,
              '  <div class="button-row">',
              `    <button class="secondary-button small-button" type="button" data-modal-equip="${item.id}">${equipLabel}</button>`,
              item.equippedBy ? `    <button class="ghost-button small-button" type="button" data-modal-unequip="${item.id}">해제</button>` : "",
              "  </div>",
              "</article>"
            ].join("");
          }).join("")}</div>`
        : '          <div class="inventory-card"><p>이 유닛이 장착 가능한 장비가 인벤토리에 없습니다.</p></div>',
      "        </section>",
      "      </div>",
      '      <section id="menu-equipment-detail" class="modal-card equipment-detail-panel"></section>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    const backdrop = host.querySelector(".menu-modal-backdrop");
    const hoveredReset = () => {
      appState.equipmentModal.hoveredItemId = null;
      appState.equipmentModal.hoveredSlotKey = null;
      renderEquipmentDetailPanel(unit);
    };

    getElement("menu-modal-close-button").addEventListener("click", closeEquipmentModal);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeEquipmentModal();
      }
    });

    host.querySelectorAll("[data-equip-slot]").forEach((slotCard) => {
      const slotKey = slotCard.dataset.equipSlot;
      const slotItemId = slotCard.dataset.slotItemId || null;

      slotCard.addEventListener("mouseenter", () => {
        appState.equipmentModal.hoveredItemId = slotItemId;
        appState.equipmentModal.hoveredSlotKey = slotKey;
        renderEquipmentDetailPanel(unit);
      });
      slotCard.addEventListener("mouseleave", hoveredReset);
      slotCard.addEventListener("dragover", (event) => {
        const draggedItem = InventoryService.getItemById(appState.saveData, appState.equipmentModal.dragItemId);

        if (!draggedItem || !InventoryService.canEquipIntoSlot(unit, draggedItem, slotKey)) {
          return;
        }

        event.preventDefault();
        slotCard.classList.add("is-drop-ready");
      });
      slotCard.addEventListener("dragleave", () => {
        slotCard.classList.remove("is-drop-ready");
      });
      slotCard.addEventListener("drop", (event) => {
        event.preventDefault();
        slotCard.classList.remove("is-drop-ready");

        const draggedItemId = appState.equipmentModal.dragItemId || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");

        if (!draggedItemId) {
          return;
        }

        try {
          const item = InventoryService.equipItemToUnit(appState.saveData, unit.id, draggedItemId, slotKey);
          persistSession(appState.saveData, appState.settings);
          showToast(`${unit.name}이(가) ${item.name} 장착`);
          renderEquipmentModal();
        } catch (error) {
          showToast(error.message, true);
        } finally {
          appState.equipmentModal.dragItemId = null;
        }
      });
    });

    host.querySelectorAll("[data-modal-item]").forEach((card) => {
      const itemId = card.dataset.modalItem;

      card.addEventListener("mouseenter", () => {
        appState.equipmentModal.hoveredItemId = itemId;
        appState.equipmentModal.hoveredSlotKey = null;
        renderEquipmentDetailPanel(unit);
      });
      card.addEventListener("mouseleave", hoveredReset);
      card.addEventListener("dragstart", (event) => {
        appState.equipmentModal.dragItemId = itemId;

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", itemId);
        }
      });
      card.addEventListener("dragend", () => {
        appState.equipmentModal.dragItemId = null;
        host.querySelectorAll(".equipment-slot-card").forEach((slotCard) => slotCard.classList.remove("is-drop-ready"));
      });
      card.addEventListener("dblclick", () => {
        try {
          const item = InventoryService.equipItemToUnit(appState.saveData, unit.id, itemId);
          persistSession(appState.saveData, appState.settings);
          showToast(`${unit.name}이(가) ${item.name} 장착`);
          renderEquipmentModal();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-modal-equip]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const item = InventoryService.equipItemToUnit(appState.saveData, unit.id, button.dataset.modalEquip);
          persistSession(appState.saveData, appState.settings);
          showToast(`${unit.name}이(가) ${item.name} 장착`);
          renderEquipmentModal();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-modal-unequip], [data-unequip-item]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();

        try {
          const itemId = button.dataset.modalUnequip || button.dataset.unequipItem;
          const item = InventoryService.unequipItem(appState.saveData, itemId);
          persistSession(appState.saveData, appState.settings);
          showToast(`${item.name} 해제`);
          renderEquipmentModal();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    renderEquipmentDetailPanel(unit);
  }

  function openEquipmentModal(unitId, options) {
    const nextOptions = options || {};
    closeDetailModal();
    closeSkillModal();
    appState.equipmentModal.unitId = unitId;
    appState.equipmentModal.hoveredItemId = nextOptions.initialItemId || null;
    appState.equipmentModal.hoveredSlotKey = null;
    appState.equipmentModal.dragItemId = null;
    renderEquipmentModal();
  }

  function renderSkillDetailPanel(unit) {
    const detailTarget = getElement("menu-skill-detail");

    if (!detailTarget) {
      return;
    }

    detailTarget.innerHTML = buildSkillDetailMarkup(unit, appState.skillModal.hoveredSkillId);
  }

  function renderSkillModal() {
    const host = getEquipmentModalHost();
    const unit = appState.saveData && appState.saveData.roster
      ? appState.saveData.roster.find((entry) => entry.id === appState.skillModal.unitId)
      : null;

    if (!host || !unit) {
      closeSkillModal();
      return;
    }

    SkillsService.normalizeUnitLearnedSkills(unit);

    const activeSkills = SkillsService.getActiveSkillsForUnit(unit);
    const passiveSkills = SkillsService.getSkillsForUnit(unit);
    const loadout = SkillsService.getActiveSkillLoadout(unit);

    host.innerHTML = [
      '<div class="modal-backdrop menu-modal-backdrop">',
      '  <div class="modal-panel modal-panel-wide">',
      '    <button id="menu-skill-modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      '    <div class="modal-body skill-modal-body">',
      `      <div class="item-title-row equipment-modal-header"><strong class="card-title">${unit.name} 스킬 관리</strong><span class="card-subtitle">${unit.className} / 액티브 최대 ${SkillsService.MAX_EQUIPPED_ACTIVE_SKILLS}개 / 남은 KP ${unit.skillPoints || 0}</span></div>`,
      '      <div class="skill-modal-layout">',
      '        <section class="skill-slot-column">',
      '          <h3>장착 액티브</h3>',
      '          <div class="skill-slot-grid">',
      loadout.map((skill, index) => {
        const performance = skill ? SkillsService.getSkillPerformance(unit, skill) : null;

        return [
          `<article class="inventory-card skill-slot-card ${skill ? "is-filled" : "is-empty"}" data-skill-slot="${index}" data-slot-skill-id="${skill ? skill.id : ""}">`,
          `  <div class="item-title-row"><strong class="card-title">${getSkillSlotLabel(index)}</strong><span class="card-subtitle">${skill ? `Lv.${skill.skillLevel}` : "EMPTY"}</span></div>`,
          `  <p>${skill ? skill.name : "장착된 액티브가 없습니다."}</p>`,
          `  <p>${performance ? performance.currentSummary : "액티브 스킬 카드를 드래그하거나 더블클릭해 배치합니다."}</p>`,
          skill ? `  <button class="ghost-button small-button" type="button" data-skill-unequip="${index}">해제</button>` : "",
          "</article>"
        ].join("");
      }).join(""),
      "          </div>",
      '          <div class="modal-card skill-slot-help-panel">',
      '            <p>장착된 3개 액티브만 전투에서 사용됩니다. 더블클릭으로 자동 배치하거나 슬롯으로 드래그해 순서를 바꿀 수 있습니다.</p>',
      "          </div>",
      "        </section>",
      '        <section class="skill-inventory-column">',
      '          <div class="item-title-row">',
      '            <h3>액티브 스킬</h3>',
      '            <span class="meta-pill is-gold">더블클릭 또는 드래그</span>',
      "          </div>",
      activeSkills.length
        ? `          <div class="skill-catalog-list">${activeSkills.map((skill) => {
            const performance = SkillsService.getSkillPerformance(unit, skill);
            const equippedIndex = (unit.equippedActiveSkillIds || []).indexOf(skill.id);

            return [
              `<article class="inventory-card skill-card ${equippedIndex >= 0 ? "is-equipped" : ""}" draggable="true" data-modal-skill="${skill.id}">`,
              `  <div class="item-title-row"><strong class="card-title">${skill.name}</strong><span class="card-subtitle">Lv.${skill.skillLevel} / ${skill.maxSkillLevel}</span></div>`,
              '  <div class="inventory-meta">',
              `    <span class="meta-pill is-cyan">${equippedIndex >= 0 ? getSkillSlotLabel(equippedIndex) : "미장착"}</span>`,
              `    <span class="meta-pill">재사용 ${skill.cooldown}턴</span>`,
              `    <span class="meta-pill">${getSkillRangeLabel(skill)}</span>`,
              "  </div>",
              `  <p>${skill.description}</p>`,
              performance ? `  <p>${performance.currentSummary}</p>` : "",
              '  <div class="button-row">',
              `    <button class="secondary-button small-button" type="button" data-skill-equip="${skill.id}">${equippedIndex >= 0 ? "재배치" : "장착"}</button>`,
              `    <button class="${skill.canLevelUp ? "primary-button" : "ghost-button"} small-button" type="button" data-skill-upgrade="${skill.id}" ${skill.canLevelUp ? "" : "disabled"}>${skill.canLevelUp ? "강화" : "최대"}</button>`,
              "  </div>",
              "</article>"
            ].filter(Boolean).join("");
          }).join("")}</div>`
        : '          <div class="inventory-card"><p>보유한 액티브 스킬이 없습니다.</p></div>',
      '          <h3>패시브 스킬</h3>',
      passiveSkills.length
        ? `          <div class="skill-catalog-list">${passiveSkills.map((skill) => (
            `<article class="inventory-card skill-card is-passive" data-passive-skill="${skill.id}"><div class="item-title-row"><strong class="card-title">${skill.name}</strong><span class="card-subtitle">${skill.sourceClassName === "special" ? "SPECIAL" : "PASSIVE"}</span></div><p>${skill.description}</p></article>`
          )).join("")}</div>`
        : '          <div class="inventory-card"><p>보유한 패시브 스킬이 없습니다.</p></div>',
      "        </section>",
      "      </div>",
      '      <section id="menu-skill-detail" class="modal-card skill-detail-panel"></section>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    const backdrop = host.querySelector(".menu-modal-backdrop");
    const hoveredReset = () => {
      appState.skillModal.hoveredSkillId = null;
      renderSkillDetailPanel(unit);
    };
    const rerenderSkillState = (toastMessage) => {
      persistSession(appState.saveData, appState.settings);
      renderSkillModal();
      if (toastMessage) {
        showToast(toastMessage);
      }
    };

    getElement("menu-skill-modal-close-button").addEventListener("click", closeSkillModal);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeSkillModal();
      }
    });

    host.querySelectorAll("[data-skill-slot]").forEach((slotCard) => {
      const slotIndex = Number(slotCard.dataset.skillSlot || 0);
      const slotSkillId = slotCard.dataset.slotSkillId || null;

      slotCard.addEventListener("mouseenter", () => {
        appState.skillModal.hoveredSkillId = slotSkillId;
        renderSkillDetailPanel(unit);
      });
      slotCard.addEventListener("mouseleave", hoveredReset);
      slotCard.addEventListener("dragover", (event) => {
        const draggedSkillId = appState.skillModal.dragSkillId;

        if (!draggedSkillId) {
          return;
        }

        event.preventDefault();
        slotCard.classList.add("is-drop-ready");
      });
      slotCard.addEventListener("dragleave", () => {
        slotCard.classList.remove("is-drop-ready");
      });
      slotCard.addEventListener("drop", (event) => {
        event.preventDefault();
        slotCard.classList.remove("is-drop-ready");
        const draggedSkillId = appState.skillModal.dragSkillId || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");

        if (!draggedSkillId) {
          return;
        }

        try {
          SkillsService.equipActiveSkill(unit, draggedSkillId, slotIndex);
          rerenderSkillState(`${unit.name}의 액티브 배치를 조정했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        } finally {
          appState.skillModal.dragSkillId = null;
        }
      });
    });

    host.querySelectorAll("[data-modal-skill]").forEach((card) => {
      const skillId = card.dataset.modalSkill;

      card.addEventListener("mouseenter", () => {
        appState.skillModal.hoveredSkillId = skillId;
        renderSkillDetailPanel(unit);
      });
      card.addEventListener("mouseleave", hoveredReset);
      card.addEventListener("dragstart", (event) => {
        appState.skillModal.dragSkillId = skillId;

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", skillId);
        }
      });
      card.addEventListener("dragend", () => {
        appState.skillModal.dragSkillId = null;
        host.querySelectorAll(".skill-slot-card").forEach((slotEntry) => slotEntry.classList.remove("is-drop-ready"));
      });
      card.addEventListener("dblclick", () => {
        try {
          SkillsService.equipActiveSkill(unit, skillId);
          rerenderSkillState(`${unit.name}의 액티브를 장착했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-passive-skill]").forEach((card) => {
      const skillId = card.dataset.passiveSkill;
      card.addEventListener("mouseenter", () => {
        appState.skillModal.hoveredSkillId = skillId;
        renderSkillDetailPanel(unit);
      });
      card.addEventListener("mouseleave", hoveredReset);
    });

    host.querySelectorAll("[data-skill-equip]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          SkillsService.equipActiveSkill(unit, button.dataset.skillEquip);
          rerenderSkillState(`${unit.name}의 액티브를 장착했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-skill-upgrade]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const upgradedSkill = SkillsService.upgradeSkill(unit, button.dataset.skillUpgrade);
          rerenderSkillState(`${upgradedSkill.name} Lv.${upgradedSkill.skillLevel} 강화`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-skill-unequip]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();

        try {
          SkillsService.unequipActiveSkill(unit, Number(button.dataset.skillUnequip || 0));
          rerenderSkillState(`${unit.name}의 액티브를 해제했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    renderSkillDetailPanel(unit);
  }

  function openSkillModal(unitId) {
    closeDetailModal();
    closeEquipmentModal();
    appState.skillModal.unitId = unitId;
    appState.skillModal.hoveredSkillId = null;
    appState.skillModal.dragSkillId = null;
    renderSkillModal();
  }

  function renderPartyManagement() {
    const rosterTarget = getElement("menu-roster-list");
    const detailTarget = getElement("menu-unit-detail") || document.createElement("div");
    const selectedUnit = ensureSelectedMenuUnit();

    if (!appState.saveData || !appState.saveData.roster || !appState.saveData.roster.length) {
      rosterTarget.innerHTML = "";
      detailTarget.textContent = "파티 데이터가 없습니다.";
      return;
    }

    rosterTarget.innerHTML = appState.saveData.roster.map((unit) => {
      const weapon = InventoryService.getItemById(appState.saveData, unit.weapon);
      const equippedCount = (unit.equippedItemIds || []).length;
      const classes = ["roster-button"];
      const isLeader = appState.saveData.leaderUnitId === unit.id;
      const draft = getProgressionDraft(unit.id);
      const pendingStats = countDraftStats(draft);
      const pendingSkills = countDraftSkills(draft);

      if (unit.id === appState.selectedMenuUnitId) {
        classes.push("active");
      }

      return [
        `<button class="${classes.join(" ")} interactive-summary-card" type="button" data-menu-unit="${unit.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
        '  <div class="roster-meta">',
        `    <span class="meta-pill rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${unit.guildRank || "D"}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill">HP ${unit.maxHp}</span>`,
        `    <span class="meta-pill">${unit.statPoints || 0} SP</span>`,
        `    <span class="meta-pill">${unit.skillPoints || 0} KP</span>`,
        pendingStats ? `    <span class="meta-pill is-preview-up">스탯 예약 ${pendingStats}</span>` : "",
        pendingSkills ? `    <span class="meta-pill is-preview-up">스킬 예약 ${pendingSkills}</span>` : "",
        `    <span class="meta-pill ${equippedCount ? "is-gold" : "is-muted"}">장비 ${equippedCount}</span>`,
        `    <span class="meta-pill ${isLeader ? "is-gold" : "is-muted"}">${isLeader ? "리더" : "일반"}</span>`,
        `    <span class="meta-pill ${isUnitSelectedForSortie(unit.id) ? "is-cyan" : "is-muted"}">${isUnitSelectedForSortie(unit.id) ? "출전 중" : "후방 대기"}</span>`,
        `    <span class="meta-pill ${weapon ? "is-gold" : "is-muted"}">${weapon ? weapon.name : "무기 없음"}</span>`,
        "  </div>",
        "  <p>클릭하면 중앙 상세 창이 열립니다.</p>",
        "</button>"
      ].filter(Boolean).join("");
    }).join("");

    const draft = getProgressionDraft(selectedUnit.id);
    const previewUnit = StatsService.previewUnitWithStatDraft(selectedUnit, draft.stats);
    const effectivePreviewUnit = InventoryService.getEffectiveUnitStats(appState.saveData, previewUnit);
    const equippedItems = InventoryService.getEquippedItems(appState.saveData, selectedUnit.id)
      .map((item) => buildEquippedItemBadge(item))
      .join("");
    const classProfile = SkillsService.getClassProfile(selectedUnit);
    const basePrimaryStats = StatsService.getPrimaryStats(selectedUnit);
    const previewPrimaryStats = StatsService.getPrimaryStats(effectivePreviewUnit);
    const equipmentBonus = effectivePreviewUnit && effectivePreviewUnit.equipmentBonus ? effectivePreviewUnit.equipmentBonus.primary || {} : {};
    const spentStats = countDraftStats(draft);
    const spentSkills = countDraftSkills(draft);
    const remainingStatPoints = Math.max(0, (selectedUnit.statPoints || 0) - spentStats);
    const remainingSkillPoints = Math.max(0, (selectedUnit.skillPoints || 0) - spentSkills);
    const learnedSkills = SkillsService.getSkillsForUnit(selectedUnit);
    const learnedActiveSkills = SkillsService.getActiveSkillsForUnit(selectedUnit);
    const equippedActiveSkills = SkillsService.getActiveSkillLoadout(selectedUnit);
    const learnableSkills = SkillsService.getLearnableSkills(selectedUnit);
    const learnableActiveSkills = SkillsService.getLearnableActiveSkills(selectedUnit);
    const pendingSkillSummaries = draft.skillIds
      .map((skillId) => SkillsService.getSkillDefinition(selectedUnit, skillId))
      .filter(Boolean)
      .map((skill) => `<span class="meta-pill is-preview-up">${skill.name}</span>`)
      .join("");

    const promotionOptions = SkillsService.getPromotionOptions(selectedUnit);
    const lockedPromotions = SkillsService.PROMOTION_TREE[selectedUnit.className] || [];
    let promotionSummary = "전직 완료";

    if (promotionOptions.length) {
      promotionSummary = promotionOptions.map((promotion) => `${promotion.className} 전직 가능`).join(" / ");
    } else if (lockedPromotions.length) {
      promotionSummary = lockedPromotions
        .map((promotion) => `${promotion.className} Lv.${promotion.unlockLevel} 필요`)
        .join(" / ");
    } else if ((selectedUnit.promotionHistory || []).length) {
      const latestPromotion = selectedUnit.promotionHistory[selectedUnit.promotionHistory.length - 1];
      promotionSummary = `${latestPromotion.from} -> ${latestPromotion.to}`;
    }

    detailTarget.innerHTML = [
      `<div class="unit-summary ally">`,
      `  <strong>${selectedUnit.name}</strong> <span>${selectedUnit.className}</span>`,
      `  <p>Lv.${selectedUnit.level} / EXP ${selectedUnit.exp} / 스탯 ${remainingStatPoints} / 스킬 ${remainingSkillPoints}</p>`,
      '  <div class="detail-stats">',
      StatsService.PRIMARY_STATS.map((statName) => (
        `    ${buildPrimaryStatPill(statName, basePrimaryStats[statName], previewPrimaryStats[statName], {
          equipmentBonus: equipmentBonus[statName] || 0,
          draftDelta: Number((draft.stats && draft.stats[statName]) || 0)
        })}`
      )).join(""),
      "  </div>",
      '  <div class="detail-stats">',
      `    <span class="meta-pill">HP ${effectivePreviewUnit.maxHp}${effectivePreviewUnit.equipmentBonus && effectivePreviewUnit.equipmentBonus.legacy && effectivePreviewUnit.equipmentBonus.legacy.maxHp ? ` (+${effectivePreviewUnit.equipmentBonus.legacy.maxHp} 장비)` : ""}</span>`,
      `    <span class="meta-pill">MOV ${effectivePreviewUnit.mov}${effectivePreviewUnit.equipmentBonus && effectivePreviewUnit.equipmentBonus.legacy && effectivePreviewUnit.equipmentBonus.legacy.mov ? ` (+${effectivePreviewUnit.equipmentBonus.legacy.mov} 장비)` : ""}</span>`,
      `    <span class="meta-pill ${spentStats ? "is-preview-up" : "is-muted"}">예약 스탯 ${spentStats}</span>`,
      `    <span class="meta-pill ${spentSkills ? "is-preview-up" : "is-muted"}">예약 스킬 ${spentSkills}</span>`,
      "  </div>",
      `  <p>길드 등급: <span class="meta-pill rank-${String(selectedUnit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(selectedUnit.guildRank || "D")}</span></p>`,
      `  <p>${classProfile.role} / ${classProfile.summary}</p>`,
      `  <p>장착 중: ${equippedItems || "없음"}</p>`,
      `  <p>출전 상태: ${isUnitSelectedForSortie(selectedUnit.id) ? "출전 파티" : "대기 인원"} / ${appState.saveData.leaderUnitId === selectedUnit.id ? "현재 리더" : "일반 멤버"}</p>`,
      `  <p>전직: ${promotionSummary}</p>`,
      `  <p>장착 액티브: ${equippedActiveSkills.filter(Boolean).length ? equippedActiveSkills.filter(Boolean).map((skill) => skill.name).join(", ") : "없음"}</p>`,
      learnedActiveSkills.length ? `  <div class="detail-stats">${learnedActiveSkills.map((skill) => buildKnownSkillBadge(skill, true, {
        isEquipped: (selectedUnit.equippedActiveSkillIds || []).includes(skill.id),
        slotLabel: (selectedUnit.equippedActiveSkillIds || []).includes(skill.id)
          ? getSkillSlotLabel((selectedUnit.equippedActiveSkillIds || []).indexOf(skill.id))
          : ""
      })).join("")}</div>` : "",
      pendingSkillSummaries ? `  <p>확정 대기 스킬</p>` : "",
      pendingSkillSummaries ? `  <div class="detail-stats">${pendingSkillSummaries}</div>` : "",
      '  <div class="detail-stats progression-stat-buttons">',
      StatsService.PRIMARY_STATS.map((statName) => (
        `<button class="ghost-button small-button" type="button" data-menu-stat-draft="${statName}" ${remainingStatPoints <= 0 || previewPrimaryStats[statName] >= StatsService.STAT_LIMITS[statName] ? "disabled" : ""}>+ ${StatsService.PRIMARY_STAT_LABELS[statName]}</button>`
      )).join(""),
      "  </div>",
      learnableSkills.length || learnableActiveSkills.length ? '  <div class="progression-skill-list">' : "",
      learnableSkills.map((skill) => (
        buildDraftableSkillCard(skill, selectedUnit, false, draft.skillIds.includes(skill.id), remainingSkillPoints)
      )).join(""),
      learnableActiveSkills.map((skill) => (
        buildDraftableSkillCard(skill, selectedUnit, true, draft.skillIds.includes(skill.id), remainingSkillPoints)
      )).join(""),
      learnableSkills.length || learnableActiveSkills.length ? "  </div>" : "",
      !learnableSkills.length && !learnableActiveSkills.length ? "  <p>현재 레벨에서 새로 배울 수 있는 스킬이 없습니다.</p>" : "",
      '  <div class="detail-actions">',
      '    <button class="primary-button small-button" type="button" data-open-equipment="true">장착 관리</button>',
      '    <button class="primary-button small-button" type="button" data-open-skill-modal="true">스킬 관리</button>',
      `    <button class="secondary-button small-button" type="button" data-set-leader="true" ${appState.saveData.leaderUnitId === selectedUnit.id ? "disabled" : ""}>리더 지정</button>`,
      '    <button class="secondary-button small-button" type="button" data-unequip-all="true">전체 해제</button>',
      `    <button class="secondary-button small-button" type="button" data-toggle-sortie="true">${isUnitSelectedForSortie(selectedUnit.id) ? "후방 대기" : "출전 등록"}</button>`,
      promotionOptions.map((promotion) => (
        `<button class="secondary-button small-button" type="button" data-promote-class="${promotion.className}">${promotion.className} 전직</button>`
      )).join(""),
      spentStats || spentSkills ? '<button class="primary-button small-button" type="button" data-progression-confirm="true">성장 확정</button>' : "",
      spentStats || spentSkills ? '<button class="ghost-button small-button" type="button" data-progression-cancel="true">예약 취소</button>' : "",
      "  </div>",
      "</div>"
    ].join("");
    appState.cachedUnitDetailUnitId = selectedUnit.id;
    appState.cachedUnitDetailMarkup = detailTarget.innerHTML;

    rosterTarget.querySelectorAll("[data-menu-unit]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.selectedMenuUnitId = button.dataset.menuUnit;
        renderMainMenu();
        openDetailModal("unit", button.dataset.menuUnit);
      });
    });
  }

  function renderInventoryList() {
    const target = getElement("menu-inventory-list");
    const selectedUnit = ensureSelectedMenuUnit();
    const inventory = appState.saveData ? appState.saveData.inventory || [] : [];
    const filteredItems = InventoryService.sortInventory(
      InventoryService.filterInventory(inventory, {
        type: appState.inventoryView.type,
        rarity: appState.inventoryView.rarity,
        equipped: appState.inventoryView.equipped
      }),
      appState.inventoryView.sort
    );
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / INVENTORY_PAGE_SIZE));
    const currentPage = Math.max(1, Math.min(totalPages, Number(appState.inventoryView.page || 1)));
    const pageStart = (currentPage - 1) * INVENTORY_PAGE_SIZE;
    const visibleItems = filteredItems.slice(pageStart, pageStart + INVENTORY_PAGE_SIZE);

    appState.inventoryView.page = currentPage;

    if (!filteredItems.length) {
      target.innerHTML = '<div class="inventory-card"><p>조건에 맞는 아이템이 없습니다.</p></div>';
      return;
    }

    target.innerHTML = visibleItems.map((item) => {
      const rarity = InventoryService.getRarityMeta(item.rarity);
      const equipDisabled = InventoryService.isEquipment(item) ? "" : "disabled";
      const unequipDisabled = item.equippedBy ? "" : "disabled";
      const useDisabled = !selectedUnit || !InventoryService.isConsumable(item) ? "disabled" : "";
      const ownerText = item.equippedBy
        ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}`
        : "미장착";

      return [
        `<article class="inventory-card compact-inventory-card rarity-${item.rarity} interactive-summary-card" data-open-detail="inventory" data-detail-id="${item.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        [
          '  <div class="inventory-meta">',
          `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
          `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
          '    <span class="inventory-meta-action inventory-click-hint">상세보기는 클릭</span>',
          "  </div>"
        ].join(""),
        '  <div class="button-row">',
        `    <button class="secondary-button small-button" type="button" data-menu-equip="${item.id}" ${equipDisabled}>장착</button>`,
        `    <button class="secondary-button small-button" type="button" data-menu-use="${item.id}" ${useDisabled}>사용</button>`,
        `    <button class="ghost-button small-button" type="button" data-menu-unequip="${item.id}" ${unequipDisabled}>해제</button>`,
        "  </div>",
        "</article>"
      ].join("");
    }).join("") + [
      '<div class="list-pagination inventory-pagination">',
      `  <button class="ghost-button small-button" type="button" data-inventory-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>`,
      `  <span class="pagination-label">${currentPage} / ${totalPages}</span>`,
      `  <button class="ghost-button small-button" type="button" data-inventory-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`,
      "</div>"
    ].join("");

    target.querySelectorAll("[data-inventory-page]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.inventoryView.page = button.dataset.inventoryPage === "next"
          ? Math.min(totalPages, currentPage + 1)
          : Math.max(1, currentPage - 1);
        renderInventoryList();
      });
    });

    target.querySelectorAll("[data-open-detail]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        openDetailModal(card.dataset.openDetail, card.dataset.detailId);
      });
    });

    target.querySelectorAll("[data-menu-equip]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal("equip-target", button.dataset.menuEquip);
      });
    });

    target.querySelectorAll("[data-menu-unequip]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          const item = InventoryService.unequipItem(appState.saveData, button.dataset.menuUnequip);
          persistSession(appState.saveData, appState.settings);
          showToast(`${item.name} 해제`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    target.querySelectorAll("[data-menu-use]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          const unit = getSelectedMenuUnit();
          const result = InventoryService.applyConsumableToUnit(appState.saveData, unit, button.dataset.menuUse);
          persistSession(appState.saveData, appState.settings);
          showToast(`${unit.name} 회복 +${result.healed}`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderShopList() {
    const target = getElement("menu-shop-list");
    const statusTarget = getElement("menu-shop-status");
    const totalProducts = InventoryService.SHOP_CATALOG.length;
    const totalPages = Math.max(1, Math.ceil(totalProducts / SHOP_PAGE_SIZE));
    const currentPage = Math.max(1, Math.min(totalPages, Number(appState.shopView.page || 1)));
    const pageStart = (currentPage - 1) * SHOP_PAGE_SIZE;
    const visibleProducts = InventoryService.SHOP_CATALOG.slice(pageStart, pageStart + SHOP_PAGE_SIZE);

    appState.shopView.page = currentPage;

    if (statusTarget) {
      statusTarget.innerHTML = [
        `<p class="status-line is-gold">보유 골드: ${appState.saveData ? appState.saveData.partyGold : 0}G</p>`,
        `<p class="status-line">인벤토리 수: ${appState.saveData && appState.saveData.inventory ? appState.saveData.inventory.length : 0}개</p>`,
        `<p class="status-line">소모품 수: ${appState.saveData && appState.saveData.inventory ? appState.saveData.inventory.filter((item) => InventoryService.isConsumable(item)).length : 0}개</p>`,
        `<p class="status-line">페이지: ${currentPage} / ${totalPages}</p>`
      ].join("");
    }

    target.innerHTML = visibleProducts.map((product) => {
      const rarity = InventoryService.getRarityMeta(product.rarity);
      const disabled = !appState.saveData || appState.saveData.partyGold < product.price ? "disabled" : "";
      return [
        `<article class="shop-card compact-commerce-card rarity-${product.rarity} interactive-summary-card" data-open-detail="shop" data-detail-id="${product.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${product.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill">${InventoryService.getTypeLabel(product.type || product.slot)}</span>`,
        `    <span class="meta-pill is-gold">${product.price}G</span>`,
        `    <button class="primary-button small-button inventory-meta-action" type="button" data-shop-buy="${product.id}" ${disabled}>구매</button>`,
        "  </div>",
        "  <p>클릭 시 상세</p>",
        "</article>"
      ].join("");
    }).join("") + [
      '<div class="list-pagination shop-pagination">',
      `  <button class="ghost-button small-button" type="button" data-shop-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>`,
      `  <span class="pagination-label">${currentPage} / ${totalPages}</span>`,
      `  <button class="ghost-button small-button" type="button" data-shop-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`,
      "</div>"
    ].join("");

    target.querySelectorAll("[data-shop-page]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.shopView.page = button.dataset.shopPage === "next"
          ? Math.min(totalPages, currentPage + 1)
          : Math.max(1, currentPage - 1);
        renderShopList();
      });
    });

    target.querySelectorAll("[data-open-detail]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        openDetailModal(card.dataset.openDetail, card.dataset.detailId);
      });
    });

    target.querySelectorAll("[data-shop-buy]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          const item = InventoryService.purchaseItem(appState.saveData, button.dataset.shopBuy);
          persistSession(appState.saveData, appState.settings);
          appState.shopView.page = Math.max(1, Math.min(
            Math.ceil(InventoryService.SHOP_CATALOG.length / SHOP_PAGE_SIZE),
            Number(appState.shopView.page || 1)
          ));
          showToast(`${item.name} 구매 완료`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderTavern() {
    const statusTarget = getElement("menu-tavern-status");
    const listTarget = getElement("menu-tavern-list");

    if (!appState.saveData || !TavernService) {
      if (statusTarget) {
        statusTarget.textContent = "주점 정보를 불러올 수 없습니다.";
      }
      if (listTarget) {
        listTarget.innerHTML = '<article class="shop-card"><p>주점 데이터가 없습니다.</p></article>';
      }
      return;
    }

    const tavern = appState.saveData.tavern;
    const nextRefreshText = tavern && tavern.nextRefreshAt
      ? `${new Date(tavern.nextRefreshAt).toLocaleString("ko-KR")} (${formatRemainingRefresh(tavern.nextRefreshAt)} 후)`
      : "알 수 없음";

    if (statusTarget) {
      statusTarget.innerHTML = [
        `<p class="status-line is-gold">보유 골드: ${appState.saveData.partyGold}G</p>`,
        `<p class="status-line">파티 리더: ${getLeaderUnit(appState.saveData) ? getLeaderUnit(appState.saveData).name : "없음"}</p>`,
        `<p class="status-line">현재 명단: ${Math.min(4, tavern && tavern.lineup ? tavern.lineup.length : 0)}명</p>`,
        `<p class="status-line">다음 교대: ${nextRefreshText}</p>`
      ].join("");
    }

    const lineup = ((tavern && tavern.lineup) || []).slice(0, 4);

    if (!lineup.length) {
      listTarget.innerHTML = '<article class="shop-card"><p>현재 주점에 머무는 모험가가 없습니다.</p></article>';
      return;
    }

    listTarget.innerHTML = lineup.map((candidate) => {
      const unit = candidate.unit;
      const rankClass = `rank-${String(candidate.guildRank || "D").toLowerCase().replace("+", "plus")}`;
      const recruited = !!candidate.recruitedAt;
      const signaturePassive = candidate.signaturePassiveId
        ? SkillsService.getSkillDefinition(unit, candidate.signaturePassiveId)
        : null;
      const summaryParts = [
        `시작 장비 ${candidate.startingWeapon.name}`,
        signaturePassive ? `고유 ${signaturePassive.name}` : null,
        `${candidate.rankTitle}`
      ].filter(Boolean);

      return [
        `<article class="shop-card tavern-card rarity-${candidate.rarity} interactive-summary-card" data-open-detail="tavern" data-detail-id="${candidate.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${rankClass}">${candidate.guildRank}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill is-gold">${candidate.hireCost}G</span>`,
        signaturePassive ? '    <span class="meta-pill is-cyan">고유 패시브</span>' : "",
        '    <span class="inventory-click-hint">상세보기는 클릭</span>',
        `    <button class="primary-button small-button inventory-meta-action" type="button" data-recruit-adventurer="${candidate.id}" ${recruited ? "disabled" : ""}>${recruited ? "영입 완료" : "영입"}</button>`,
        "  </div>",
        "</article>"
      ].join("");
    }).join("");

    listTarget.querySelectorAll("[data-open-detail]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        openDetailModal(card.dataset.openDetail, card.dataset.detailId);
      });
    });

    listTarget.querySelectorAll("[data-recruit-adventurer]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        try {
          const result = TavernService.recruitAdventurer(appState.saveData, button.dataset.recruitAdventurer);
          appState.selectedMenuUnitId = result.unit.id;
          persistSession(appState.saveData, appState.settings);
          showToast(`${result.unit.name} 영입 완료`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderSettingsList() {
    const target = getElement("menu-settings-list");
    const settings = appState.settings || {};
    const settingDescriptors = [
      { key: "gridVisible", label: "격자선 표시", value: settings.gridVisible ? "활성" : "비활성" },
      { key: "actionLogVisible", label: "행동 로그 표시", value: settings.actionLogVisible ? "활성" : "비활성" },
      { key: "confirmEndTurn", label: "턴 종료 확인", value: settings.confirmEndTurn ? "활성" : "비활성" }
    ];

    target.innerHTML = settingDescriptors.map((setting) => [
      '<article class="settings-card">',
      `  <div class="item-title-row"><strong class="card-title">${setting.label}</strong><span class="card-subtitle">전투 UI</span></div>`,
      `  <div class="settings-meta"><span class="meta-pill ${setting.value === "활성" ? "is-cyan" : "is-muted"}">${setting.value}</span></div>`,
      '  <div class="button-row">',
      `    <button class="ghost-button small-button" type="button" data-toggle-setting="${setting.key}">토글</button>`,
      "  </div>",
      "</article>"
    ].join("")).concat([
      '<article class="settings-card">',
      '  <div class="item-title-row"><strong class="card-title">전술 시점</strong><span class="card-subtitle">고정 탑다운</span></div>',
      '  <div class="settings-meta"><span class="meta-pill is-gold">회전 없음</span><span class="meta-pill">던전보드 고정</span></div>',
      '  <p class="muted-text">입구, 출구, 특수 방 표식을 기준으로 전장을 읽는 방식입니다.</p>',
      "</article>"
    ]).join("");

    target.querySelectorAll("[data-toggle-setting]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.toggleSetting;
        appState.settings[key] = !appState.settings[key];
        persistSession(appState.saveData, appState.settings);
        showToast(`${button.parentElement.parentElement.querySelector("strong").textContent} 설정 변경`);
      });
    });

  }

  function renderStageList() {
    const target = getElement("menu-stage-list");
    const focusTarget = getElement("menu-stage-focus");

    if (!appState.saveData) {
      target.innerHTML = '<article class="stage-card"><p>세이브 데이터가 없습니다.</p></article>';
      if (focusTarget) {
        focusTarget.textContent = "세이브 데이터가 없습니다.";
      }
      return;
    }

    const stages = BattleService.getStageCatalog(appState.saveData).filter((stage) => !stage.hidden);
    const selectedStage = stages.find((stage) => stage.selected) || stages[0] || null;
    const tutorialStages = stages.filter((stage) => stage.category === "tutorial");
    const tutorialsCleared = tutorialStages.length > 0 && tutorialStages.every((stage) => stage.cleared);

    if (!tutorialsCleared) {
      appState.activeStageTab = "all";
    } else if (appState.activeStageTab === "all") {
      appState.activeStageTab = selectedStage && selectedStage.category === "tutorial" ? "prologue" : "main";
    }

    const visibleStages = tutorialsCleared
      ? stages.filter((stage) => (
          appState.activeStageTab === "prologue"
            ? stage.category === "tutorial"
            : stage.category === "main"
        ))
      : stages.slice().sort((left, right) => {
          if (left.category !== right.category) {
            return left.category === "tutorial" ? -1 : 1;
          }

          if (left.id === "endless-rift") {
            return -1;
          }

          if (right.id === "endless-rift") {
            return 1;
          }

          return left.order - right.order;
        });

    const orderedVisibleStages = visibleStages.slice().sort((left, right) => {
      if (left.id === "endless-rift") {
        return -1;
      }

      if (right.id === "endless-rift") {
        return 1;
      }

      return left.order - right.order;
    });

    if (focusTarget) {
      focusTarget.innerHTML = [
        tutorialsCleared
          ? '<div class="stage-panel-tabs">'
            + `<button class="stage-panel-tab ${appState.activeStageTab === "main" ? "active" : ""}" type="button" data-stage-tab="main">메인 작전</button>`
            + `<button class="stage-panel-tab ${appState.activeStageTab === "prologue" ? "active" : ""}" type="button" data-stage-tab="prologue">프롤로그</button>`
            + "</div>"
          : "",
        `<div class="stage-focus-body">${formatStageFocus(selectedStage).replace(/\n/g, "<br>")}</div>`
      ].filter(Boolean).join("");
    }

    target.innerHTML = orderedVisibleStages.map((stage) => {
      const classes = ["stage-card"];

      if (stage.selected) {
        classes.push("active");
      }

      if (!stage.available) {
        classes.push("locked");
      }

      classes.push(stage.category === "main" ? "is-main-stage" : "is-tutorial-stage");
      if (stage.inProgress) {
        classes.push("is-in-progress");
      }

      return [
        `<article class="${classes.join(" ")} interactive-summary-card" data-open-detail="stage" data-detail-id="${stage.id}">`,
        `  <div class="item-title-row"><strong>${stage.order}. ${stage.name}</strong><span>${stage.available ? "개방" : "잠김"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${stage.category === "main" ? "is-gold" : "is-cyan"}">${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"}</span>`,
        `    <span class="meta-pill is-gold">${stage.rewardGold}G</span>`,
        `    <span class="meta-pill ${stage.cleared ? "is-cyan" : "is-muted"}">${stage.cleared ? "클리어" : "미클리어"}</span>`,
        `    <span class="meta-pill ${stage.inProgress ? "is-crimson" : "is-muted"}">${stage.inProgress ? "진행 중" : "준비"}</span>`,
        `    <button class="${stage.selected ? "secondary-button" : "primary-button"} small-button inventory-meta-action" type="button" data-stage-id="${stage.id}" ${!stage.available || stage.selected ? "disabled" : ""}>${stage.selected ? "선택됨" : "선택"}</button>`,
        "  </div>",
        `  <p>${stage.victoryLabel}${stage.id === "endless-rift" ? ` / ${stage.objective}` : ""}</p>`,
        "</article>"
      ].join("");
    }).join("");

    if (focusTarget) {
      focusTarget.querySelectorAll("[data-stage-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          appState.activeStageTab = button.dataset.stageTab;
          renderStageList();
        });
      });
    }

    target.querySelectorAll("[data-open-detail]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        openDetailModal(card.dataset.openDetail, card.dataset.detailId);
      });
    });

    target.querySelectorAll("[data-stage-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const stageId = button.dataset.stageId;

        try {
          const requiresAbandon =
            appState.saveData.stageStatus === "in_progress" &&
            appState.saveData.battleState &&
            appState.saveData.stageId !== stageId;

          if (requiresAbandon && !global.confirm("진행 중인 전투를 포기하고 다른 스테이지를 선택하시겠습니까?")) {
            return;
          }

          const stage = BattleService.selectCampaignStage(appState.saveData, stageId, {
            abandonCurrentBattle: requiresAbandon
          });
          persistSession(appState.saveData, appState.settings);
          showToast(`${stage.name} 선택`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderRewardCodex() {
    const target = getElement("menu-reward-codex");

    if (!appState.saveData) {
      target.innerHTML = '<article class="reward-card"><p>세이브 데이터가 없습니다.</p></article>';
      return;
    }

    const rewards = BattleService.getRewardCodex(appState.saveData);

    target.innerHTML = rewards.map((reward) => {
      const rarity = InventoryService.getRarityMeta(reward.rewardRarity);
      const classes = ["reward-card"];

      if (!reward.discovered) {
        classes.push("locked");
      }

      return [
        `<article class="${classes.join(" ")} rarity-${reward.rewardRarity} interactive-summary-card" data-open-detail="codex" data-detail-id="${reward.stageId}">`,
        `  <div class="item-title-row"><strong class="card-title">${reward.discovered ? reward.rewardName : "???"}</strong><span class="card-subtitle">${reward.discovered ? rarity.label : "미발견"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill">${reward.stageName}</span>`,
        `    <span class="meta-pill is-crimson">보스 ${reward.bossName}</span>`,
        `    <span class="meta-pill">${reward.rewardType}</span>`,
        "  </div>",
        `  <p>${reward.discovered ? reward.rewardDescription : "해당 스테이지의 보스를 격파하면 정보가 기록됩니다."}</p>`,
        "  <div class=\"button-row\">",
        "    <button class=\"ghost-button small-button\" type=\"button\">상세 보기</button>",
        "  </div>",
        "</article>"
      ].join("");
    }).join("");

    target.querySelectorAll("[data-open-detail]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          event.preventDefault();
        }

        openDetailModal(card.dataset.openDetail, card.dataset.detailId);
      });
    });
  }

  function renderMainMenu() {
    InventoryService.normalizeInventoryState(appState.saveData);
    StatsService.normalizeRosterProgression(appState.saveData);
    SkillsService.normalizeRosterLearnedSkills(appState.saveData);
    syncTavernState(false);
    renderPartyManagement();
    renderStageList();
    renderInventoryList();
    renderSettingsList();
    renderShopList();
    renderTavern();
    renderRewardCodex();
    setActiveMainPanel(appState.activeMainPanel);
    getElement("menu-inventory-sort").value = appState.inventoryView.sort;
    getElement("menu-inventory-type-filter").value = appState.inventoryView.type;
    getElement("menu-inventory-rarity-filter").value = appState.inventoryView.rarity;
    getElement("menu-inventory-equipped-filter").value = appState.inventoryView.equipped;
    const selectedStage = getSelectedStageMeta();
    getElement("start-battle-button").textContent = `출격: ${selectedStage ? selectedStage.name : (appState.saveData ? appState.saveData.stageId : "stage")}`;

    const resumeButton = getElement("resume-battle-button");

    if (resumeButton) {
      resumeButton.disabled = !appState.saveData || appState.saveData.stageStatus !== "in_progress" || !appState.saveData.battleState;
    }
  }

  function persistSession(saveData, settings) {
    if (!appState.currentUserId) {
      return;
    }

    InventoryService.normalizeInventoryState(saveData);
    StatsService.normalizeRosterProgression(saveData);
    SkillsService.normalizeRosterLearnedSkills(saveData);
    appState.saveData = saveData;
    appState.settings = settings;
    StorageService.setUserSave(appState.currentUserId, saveData);
    StorageService.setUserSettings(appState.currentUserId, settings);

    if (getElement("screen-main-menu").classList.contains("active")) {
      renderMainMenu();
    }
  }

  function getCurrentSession() {
    return {
      userId: appState.currentUserId,
      saveData: appState.saveData,
      settings: appState.settings
    };
  }

  function loadUserSession(userId) {
    closeMenuModals();
    const bundle = StorageService.ensureUserData(userId);
    appState.currentUserId = userId;
    appState.saveData = bundle.saveData;
    appState.settings = bundle.settings;
    appState.progressionDrafts = {};
    appState.inventoryView.page = 1;
    appState.shopView.page = 1;
    InventoryService.normalizeInventoryState(appState.saveData);
    StatsService.normalizeRosterProgression(appState.saveData);
    SkillsService.normalizeRosterLearnedSkills(appState.saveData);
    syncTavernState(false);
    ensureSelectedMenuUnit();

    if (!appState.menuClockTimer) {
      appState.menuClockTimer = setInterval(handleMenuClockTick, 60000);
    }

    StorageService.setCurrentUser(userId);
    renderSessionChrome();
    renderMainMenu();
    showScreen("screen-main-menu");
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    const rawUserId = getElement("register-user-id").value;
    const password = getElement("register-password").value;
    const passwordConfirm = getElement("register-password-confirm").value;
    const userId = normalizeUserId(rawUserId);

    if (!validateUserId(userId)) {
      showToast("아이디는 4~20자의 영문, 숫자, 밑줄만 사용할 수 있습니다.", true);
      return;
    }

    if (!validatePassword(password)) {
      showToast("비밀번호는 8자 이상이면 됩니다.", true);
      return;
    }

    if (password !== passwordConfirm) {
      showToast("비밀번호 확인이 일치하지 않습니다.", true);
      return;
    }

    const users = StorageService.getUsers();

    if (users[userId]) {
      showToast("이미 존재하는 아이디입니다.", true);
      return;
    }

    try {
      const passwordSecret = await CryptoService.hashPassword(password);

      users[userId] = {
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        password: passwordSecret
      };

      StorageService.saveUsers(users);
      StorageService.ensureUserData(userId);
      loadUserSession(userId);
      event.target.reset();
      showToast("회원가입이 완료되었습니다.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "회원가입 처리 중 오류가 발생했습니다.", true);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const userId = normalizeUserId(getElement("login-user-id").value);
    const password = getElement("login-password").value;
    const users = StorageService.getUsers();
    const userRecord = users[userId];

    if (!userRecord) {
      showToast("존재하지 않는 아이디입니다.", true);
      return;
    }

    try {
      const isValid = await CryptoService.verifyPassword(password, userRecord.password);

      if (!isValid) {
        showToast("비밀번호가 올바르지 않습니다.", true);
        return;
      }

      userRecord.updatedAt = new Date().toISOString();
      users[userId] = userRecord;
      StorageService.saveUsers(users);

      loadUserSession(userId);
      event.target.reset();
      showToast("로그인되었습니다.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "로그인 처리 중 오류가 발생했습니다.", true);
    }
  }

  function handleLogout() {
    closeMenuModals();
    StorageService.clearCurrentUser();
    appState.currentUserId = null;
    appState.saveData = null;
    appState.settings = null;
    appState.selectedMenuUnitId = null;
    appState.progressionDrafts = {};
    appState.activeMainPanel = "party";
    appState.inventoryView.sort = "rarity";
    appState.inventoryView.type = "all";
    appState.inventoryView.rarity = "all";
    appState.inventoryView.equipped = "all";
    appState.inventoryView.page = 1;
    appState.shopView.page = 1;
    renderSessionChrome();
    showScreen("screen-start");
    showToast("로그아웃되었습니다.");
  }

  function bindEvents() {
    getElement("go-login-button").addEventListener("click", () => showScreen("screen-login"));
    getElement("go-register-button").addEventListener("click", () => showScreen("screen-register"));
    getElement("continue-session-button").addEventListener("click", () => {
      if (appState.currentUserId) {
        loadUserSession(appState.currentUserId);
      }
    });
    getElement("back-from-login-button").addEventListener("click", () => showScreen("screen-start"));
    getElement("back-from-register-button").addEventListener("click", () => showScreen("screen-start"));
    getElement("global-logout-button").addEventListener("click", handleLogout);
    getElement("global-user-badge").addEventListener("click", () => {
      if (appState.currentUserId) {
        openDetailModal("profile", appState.currentUserId);
      }
    });
    getElement("login-form").addEventListener("submit", handleLoginSubmit);
    getElement("register-form").addEventListener("submit", handleRegisterSubmit);
    getElement("start-battle-button").addEventListener("click", () => {
      try {
        closeMenuModals();
        BattleView.startNewBattle(getCurrentSession());
      } catch (error) {
        showToast(error.message, true);
      }
    });
    getElement("resume-battle-button").addEventListener("click", () => {
      if (!appState.saveData || !appState.saveData.battleState) {
        showToast("이어할 전투가 없습니다.", true);
        return;
      }

      try {
        closeMenuModals();
        BattleView.resumeBattle(getCurrentSession());
      } catch (error) {
        showToast(error.message, true);
      }
    });
    getElement("refresh-save-button").addEventListener("click", () => {
      if (!appState.currentUserId) {
        return;
      }

      loadUserSession(appState.currentUserId);
      showToast("세이브 정보를 새로고침했습니다.");
    });
    document.querySelectorAll("[data-menu-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveMainPanel(button.dataset.menuPanel);
      });
    });
    getElement("menu-inventory-sort").addEventListener("change", (event) => {
      appState.inventoryView.sort = event.target.value;
      appState.inventoryView.page = 1;
      renderInventoryList();
    });
    getElement("menu-inventory-type-filter").addEventListener("change", (event) => {
      appState.inventoryView.type = event.target.value;
      appState.inventoryView.page = 1;
      renderInventoryList();
    });
    getElement("menu-inventory-rarity-filter").addEventListener("change", (event) => {
      appState.inventoryView.rarity = event.target.value;
      appState.inventoryView.page = 1;
      renderInventoryList();
    });
    getElement("menu-inventory-equipped-filter").addEventListener("change", (event) => {
      appState.inventoryView.equipped = event.target.value;
      appState.inventoryView.page = 1;
      renderInventoryList();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && appState.equipmentModal.unitId) {
        closeEquipmentModal();
      }

      if (event.key === "Escape" && appState.skillModal.unitId) {
        closeSkillModal();
      }

      if (event.key === "Escape" && appState.detailModal.type) {
        closeDetailModal();
      }
    });
  }

  function handleMenuClockTick() {
    if (!appState.currentUserId || !getElement("screen-main-menu").classList.contains("active")) {
      return;
    }

    syncTavernState(true);
    renderMainMenu();
  }

  function bootstrapSession() {
    const currentUserId = StorageService.getCurrentUser();

    if (!currentUserId) {
      renderSessionChrome();
      showScreen("screen-start");
      return;
    }

    const users = StorageService.getUsers();

    if (!users[currentUserId]) {
      StorageService.clearCurrentUser();
      renderSessionChrome();
      showScreen("screen-start");
      return;
    }

    loadUserSession(currentUserId);
  }

  function init() {
    BattleView.init({
      getSession: getCurrentSession,
      persistSession,
      showToast,
      showScreen,
      onReturnMenu: () => {
        renderMainMenu();
        showScreen("screen-main-menu");
      }
    });
    bindEvents();
    appState.menuClockTimer = setInterval(handleMenuClockTick, 60000);
    bootstrapSession();
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
