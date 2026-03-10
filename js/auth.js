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
  const ROSTER_PAGE_SIZE = 3;
  const SHOP_PAGE_SIZE = 9;
  const SHOP_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
  const SHOP_CONSUMABLE_LINEUP_SIZE = 2;
  const SHOP_EQUIPMENT_LINEUP_SIZE = 12;
  const INVENTORY_PAGE_SIZE = 8;
  const EQUIPMENT_MODAL_PAGE_SIZE = 8;
  const EQUIP_TARGET_MODAL_PAGE_SIZE = 10;
  const SORTIE_MANAGER_PAGE_SIZE = 4;
  const PASSIVE_SKILL_MODAL_PAGE_SIZE = 8;

  const appState = {
    currentUserId: null,
    saveData: null,
    settings: null,
    selectedMenuUnitId: null,
    activeMainPanel: "party",
    rosterView: {
      page: 1
    },
    inventoryView: {
      category: "equipment",
      sort: "rarity",
      type: "all",
      rarity: "all",
      equipped: "all",
      page: 1
    },
    shopView: {
      category: "equipment",
      page: 1
    },
    progressionDrafts: {},
    equipmentModal: {
      unitId: null,
      hoveredItemId: null,
      hoveredSlotKey: null,
      previewSlotKey: null,
      dragItemId: null,
      page: 1
    },
    skillModal: {
      unitId: null,
      hoveredSkillId: null,
      dragSkillId: null,
      passivePage: 1
    },
    detailModal: {
      type: null,
      id: null,
      page: 1
    },
    pendingEquipAction: null,
    quickSwapSlotIndex: null,
    sortieManagerView: {
      page: 1,
      dragUnitId: null
    },
    activeStageTab: "all",
    cachedUnitDetailUnitId: null,
    cachedUnitDetailMarkup: "",
    toastTimer: null,
    menuClockTimer: null,
    floatingTooltip: {
      trigger: null,
      element: null,
      rafId: 0
    }
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

  function ensureFloatingStatTooltip() {
    if (appState.floatingTooltip.element && appState.floatingTooltip.element.isConnected) {
      return appState.floatingTooltip.element;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "floating-stat-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tooltip);
    appState.floatingTooltip.element = tooltip;
    return tooltip;
  }

  function cancelFloatingStatTooltipFrame() {
    if (appState.floatingTooltip.rafId) {
      cancelAnimationFrame(appState.floatingTooltip.rafId);
      appState.floatingTooltip.rafId = 0;
    }
  }

  function positionFloatingStatTooltip(trigger) {
    if (!trigger || !trigger.isConnected) {
      hideFloatingStatTooltip();
      return;
    }

    const tooltip = ensureFloatingStatTooltip();
    const triggerRect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 12;

    tooltip.classList.remove("is-above", "is-below");
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";

    const tooltipRect = tooltip.getBoundingClientRect();
    let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));

    let top = triggerRect.top - tooltipRect.height - gap;
    let sideClass = "is-above";

    if (top < viewportPadding) {
      top = triggerRect.bottom + gap;
      sideClass = "is-below";
    }

    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.classList.add(sideClass);
  }

  function scheduleFloatingStatTooltipPosition(trigger) {
    cancelFloatingStatTooltipFrame();
    appState.floatingTooltip.rafId = requestAnimationFrame(() => {
      appState.floatingTooltip.rafId = 0;
      positionFloatingStatTooltip(trigger);
    });
  }

  function showFloatingStatTooltip(trigger) {
    const tooltipText = trigger && trigger.dataset ? trigger.dataset.statTooltip : "";
    const tooltipHtml = trigger && trigger.dataset ? trigger.dataset.tooltipHtml : "";

    if (!tooltipText && !tooltipHtml) {
      hideFloatingStatTooltip();
      return;
    }

    const tooltip = ensureFloatingStatTooltip();
    appState.floatingTooltip.trigger = trigger;
    if (tooltipHtml) {
      tooltip.innerHTML = tooltipHtml;
      tooltip.classList.add("is-rich-tooltip");
    } else {
      tooltip.textContent = tooltipText;
      tooltip.classList.remove("is-rich-tooltip");
    }
    tooltip.classList.add("visible");
    tooltip.setAttribute("aria-hidden", "false");
    scheduleFloatingStatTooltipPosition(trigger);
  }

  function hideFloatingStatTooltip() {
    cancelFloatingStatTooltipFrame();
    appState.floatingTooltip.trigger = null;

    if (!appState.floatingTooltip.element) {
      return;
    }

    appState.floatingTooltip.element.classList.remove("visible", "is-above", "is-below", "is-rich-tooltip");
    appState.floatingTooltip.element.setAttribute("aria-hidden", "true");
  }

  function getStatTooltipTrigger(target) {
    return target && target.closest
      ? target.closest("[data-stat-tooltip], [data-tooltip-html]")
      : null;
  }

  function handleStatTooltipMouseOver(event) {
    const trigger = getStatTooltipTrigger(event.target);

    if (!trigger) {
      return;
    }

    showFloatingStatTooltip(trigger);
  }

  function handleStatTooltipMouseOut(event) {
    const currentTrigger = appState.floatingTooltip.trigger;

    if (!currentTrigger || !currentTrigger.contains(event.target)) {
      return;
    }

    if (event.relatedTarget && currentTrigger.contains(event.relatedTarget)) {
      return;
    }

    hideFloatingStatTooltip();
  }

  function handleFloatingStatTooltipViewportChange() {
    if (!appState.floatingTooltip.trigger) {
      return;
    }

    scheduleFloatingStatTooltipPosition(appState.floatingTooltip.trigger);
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

  function getSignaturePassiveIds(entity) {
    if (!entity) {
      return [];
    }

    return Array.from(
      new Set(
        []
          .concat(Array.isArray(entity.signaturePassiveIds) ? entity.signaturePassiveIds : [])
          .concat(entity.signaturePassiveId ? [entity.signaturePassiveId] : [])
          .filter(Boolean)
      )
    );
  }

  function getSignaturePassiveDefinitions(unit, entity) {
    return getSignaturePassiveIds(entity || unit)
      .map((skillId) => SkillsService.getSkillDefinition(unit, skillId))
      .filter(Boolean);
  }

  function buildPotentialPill(unit) {
    const potentialMeta = StatsService.getPotentialMeta(unit);
    return `<span class="meta-pill is-violet">잠재 ${potentialMeta.label}</span>`;
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

  function renderDetailHeaderActions() {
    const headerActions = getElement("menu-detail-header-actions");
    const inventoryTabs = getElement("inventory-header-tabs");
    const shopTabs = getElement("shop-header-tabs");
    const tavernActions = getElement("tavern-header-actions");

    if (!headerActions) {
      return;
    }

    const isInventoryPanel = appState.activeMainPanel === "inventory";
    const isShopPanel = appState.activeMainPanel === "shop";
    const isTavernPanel = appState.activeMainPanel === "tavern";

    headerActions.classList.toggle("hidden", !isInventoryPanel && !isShopPanel && !isTavernPanel);

    if (inventoryTabs) {
      inventoryTabs.classList.toggle("hidden", !isInventoryPanel);
    }

    if (shopTabs) {
      shopTabs.classList.toggle("hidden", !isShopPanel);
    }

    if (tavernActions) {
      tavernActions.classList.toggle("hidden", !isTavernPanel);
    }

    if (!isTavernPanel || !appState.saveData || !TavernService) {
      return;
    }

    const manualState = TavernService.getManualRefreshState(appState.saveData);
    const refreshButton = getElement("tavern-manual-refresh-button");
    const paidRefreshButton = getElement("tavern-paid-refresh-button");
    const refreshCount = getElement("tavern-manual-refresh-count");
    const refreshTimer = getElement("tavern-manual-refresh-timer");

    if (refreshButton) {
      refreshButton.disabled = manualState.remaining <= 0;
      refreshButton.textContent = "무료 새로고침";
    }

    if (paidRefreshButton) {
      paidRefreshButton.disabled = !manualState.canAffordPaid;
      paidRefreshButton.textContent = `${manualState.refreshCost}G 새로고침`;
    }

    if (refreshCount) {
      refreshCount.textContent = `${manualState.remaining}/${manualState.limit}`;
    }

    if (refreshTimer) {
      refreshTimer.textContent = manualState.remaining <= 0
        ? `무료 교체 소진 / ${formatRemainingRefresh(manualState.resetAt)} 뒤 초기화`
        : `오늘 남은 무료 교체 ${manualState.remaining}회`;
    }
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

  function shuffleList(values) {
    const shuffled = Array.isArray(values) ? values.slice() : [];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const temp = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = temp;
    }

    return shuffled;
  }

  function ensureShopStateShape() {
    if (!appState.saveData) {
      return null;
    }

    if (!appState.saveData.shop || typeof appState.saveData.shop !== "object") {
      appState.saveData.shop = {
        refreshBlock: null,
        nextRefreshAt: null,
        lineupIds: []
      };
    }

    if (!Array.isArray(appState.saveData.shop.lineupIds)) {
      appState.saveData.shop.lineupIds = [];
    }

    return appState.saveData.shop;
  }

  function buildSupplyShopLineupIds() {
    const availableProducts = InventoryService.SHOP_CATALOG.filter((product) => InventoryService.isAvailableInShop(product));
    const consumables = shuffleList(availableProducts.filter((product) => InventoryService.isConsumable(product)))
      .slice(0, SHOP_CONSUMABLE_LINEUP_SIZE);
    const equipment = shuffleList(availableProducts.filter((product) => InventoryService.isEquipment(product)))
      .slice(0, SHOP_EQUIPMENT_LINEUP_SIZE);

    return consumables.concat(equipment).map((product) => product.id);
  }

  function syncShopState(showRefreshToast) {
    if (!appState.saveData || !appState.currentUserId) {
      return null;
    }

    const shop = ensureShopStateShape();

    if (!shop) {
      return null;
    }

    const now = Date.now();
    const refreshBlock = Math.floor(now / SHOP_REFRESH_INTERVAL_MS);
    const nextRefreshAt = new Date((refreshBlock + 1) * SHOP_REFRESH_INTERVAL_MS).toISOString();
    const needsRefresh = shop.refreshBlock !== refreshBlock
      || !shop.nextRefreshAt
      || !Array.isArray(shop.lineupIds)
      || !shop.lineupIds.length;

    if (!needsRefresh) {
      shop.nextRefreshAt = nextRefreshAt;
      return shop;
    }

    shop.refreshBlock = refreshBlock;
    shop.nextRefreshAt = nextRefreshAt;
    shop.lineupIds = buildSupplyShopLineupIds();
    appState.shopView.page = 1;
    appState.saveData = StorageService.setUserSave(appState.currentUserId, appState.saveData);

    if (showRefreshToast) {
      showToast("보급 상점 목록이 새로 갱신되었습니다.");
    }

    return shop;
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

  function buildStageFocusMarkup(stage) {
    if (!stage) {
      return [
        '<div class="stage-focus-body is-empty">',
        '  <div class="stage-focus-topline">',
        '    <div><div class="detail-hero-label">MISSION FOCUS</div><strong class="stage-focus-title">선택된 스테이지 없음</strong></div>',
        "  </div>",
        '  <p class="stage-focus-copy">좌측 작전 카드에서 선택하면 핵심 정보가 여기에 표시됩니다.</p>',
        "</div>"
      ].join("");
    }

    const statusText = stage.inProgress ? "진행 중" : stage.cleared ? "클리어" : "준비";
    const stageFlavor = stage.id === "endless-rift"
      ? "층마다 지형과 적 구성이 재편되는 장기전."
      : stage.category === "main"
        ? "편성과 장비 조정이 중요한 메인 전장."
        : "전투 흐름을 익히기 좋은 프롤로그.";

    return [
      `<div class="stage-focus-body ${stage.category === "main" ? "is-main" : "is-tutorial"} ${stage.id === "endless-rift" ? "is-endless" : ""}">`,
      '  <div class="stage-focus-topline">',
      `    <div><div class="detail-hero-label">MISSION FOCUS</div><strong class="stage-focus-title">${stage.order}. ${stage.name}</strong></div>`,
      `    <div class="stage-focus-status ${stage.inProgress ? "is-live" : stage.cleared ? "is-cleared" : "is-ready"}">${statusText}</div>`,
      "  </div>",
      '  <div class="inventory-meta stage-focus-meta">',
      `    <span class="meta-pill ${stage.category === "main" ? "is-gold" : "is-cyan"}">${stage.category === "main" ? "메인 작전" : "프롤로그"}</span>`,
      `    <span class="meta-pill ${stage.available ? "is-cyan" : "is-muted"}">${stage.available ? "개방" : "잠김"}</span>`,
      `    <span class="meta-pill is-gold">${stage.rewardGold}G</span>`,
      `    <span class="meta-pill ${stage.cleared ? "is-cyan" : "is-muted"}">${stage.cleared ? "클리어" : "미클리어"}</span>`,
      `    <span class="meta-pill ${stage.selected ? "is-violet" : "is-muted"}">${stage.selected ? "현재 출격 대상" : "대기 중"}</span>`,
      "  </div>",
      '  <div class="stage-focus-grid">',
      `    ${buildDetailKeyValue("승리 조건", stage.victoryLabel, "gold")}`,
      `    ${buildDetailKeyValue("임무 목표", stage.objective, "cyan")}`,
      "  </div>",
      `  <p class="stage-focus-copy">${stageFlavor}</p>`,
      "</div>"
    ].join("");
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

  function setActiveMainPanel(panelKey, options) {
    const nextOptions = options || {};
    const preserveModals = !!nextOptions.preserveModals;

    if (!preserveModals && appState.equipmentModal.unitId && panelKey !== "party") {
      closeEquipmentModal();
    }

    if (!preserveModals && appState.skillModal.unitId && panelKey !== "party") {
      closeSkillModal();
    }

    if (!preserveModals && appState.detailModal.type) {
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
    renderDetailHeaderActions();

    const sortieStrip = getElement("menu-sortie-strip");
    if (sortieStrip) {
      sortieStrip.classList.toggle("hidden", appState.activeMainPanel !== "party");
    }
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

  function getGuildRankSortValue(rank, rankOrder) {
    const order = Array.isArray(rankOrder) && rankOrder.length
      ? rankOrder
      : (TavernService.GUILD_RANK_ORDER || ["D", "C", "B", "A", "S", "SS", "SSS"]);
    const rankIndex = order.indexOf(rank || "D");
    return rankIndex >= 0 ? rankIndex : -1;
  }

  function sortPartyRoster(roster, selectedPartyIds) {
    const sourceRoster = Array.isArray(roster) ? roster : [];
    const partyIds = Array.isArray(selectedPartyIds) ? selectedPartyIds : [];
    const selectedPartyMap = new Map(partyIds.map((unitId, index) => [unitId, index]));
    const rosterIndexMap = new Map(sourceRoster.map((unit, index) => [unit.id, index]));
    const rankOrder = TavernService.GUILD_RANK_ORDER || ["D", "C", "B", "A", "S", "SS", "SSS"];

    return sourceRoster.slice().sort((left, right) => {
      const leftSelected = selectedPartyMap.has(left.id);
      const rightSelected = selectedPartyMap.has(right.id);

      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }

      const rankDiff = getGuildRankSortValue(right.guildRank, rankOrder) - getGuildRankSortValue(left.guildRank, rankOrder);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      const levelDiff = Number(right.level || 0) - Number(left.level || 0);
      if (levelDiff !== 0) {
        return levelDiff;
      }

      if (leftSelected && rightSelected) {
        return (selectedPartyMap.get(left.id) || 0) - (selectedPartyMap.get(right.id) || 0);
      }

      return (rosterIndexMap.get(left.id) || 0) - (rosterIndexMap.get(right.id) || 0);
    });
  }

  function formatConsumableUseMessage(unit, result) {
    if (!unit || !result) {
      return "소모품을 사용했습니다.";
    }

    if (result.effectKind === "heal") {
      return `${unit.name} 회복 +${result.healed}`;
    }

    if (result.effectKind === "reset_stats") {
      return `${unit.name} 스탯 포인트 ${result.refundedPoints} 재분배 가능`;
    }

    return `${unit.name}이(가) ${result.item ? result.item.name : "소모품"}을 사용했습니다.`;
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

  function removeSortieSlot(slotIndex) {
    const selectedPartyIds = getSelectedPartyIds().slice();

    if (slotIndex < 0 || slotIndex >= selectedPartyIds.length) {
      return null;
    }

    const removedUnitId = selectedPartyIds[slotIndex];
    selectedPartyIds.splice(slotIndex, 1);
    appState.saveData.selectedPartyIds = selectedPartyIds;

    if (appState.quickSwapSlotIndex === slotIndex) {
      appState.quickSwapSlotIndex = null;
    } else if (appState.quickSwapSlotIndex !== null && appState.quickSwapSlotIndex > slotIndex) {
      appState.quickSwapSlotIndex -= 1;
    }

    return removedUnitId;
  }

  function assignUnitToSortieSlot(unitId, slotIndex) {
    const unit = appState.saveData && appState.saveData.roster
      ? appState.saveData.roster.find((entry) => entry.id === unitId)
      : null;

    if (!unit) {
      throw new Error("배치할 캐릭터를 찾을 수 없습니다.");
    }

    const selectedPartyIds = getSelectedPartyIds().slice();
    const existingIndex = selectedPartyIds.indexOf(unitId);
    let targetSlotIndex = Number(slotIndex || 0);

    if (existingIndex !== -1) {
      selectedPartyIds.splice(existingIndex, 1);

      if (existingIndex < targetSlotIndex) {
        targetSlotIndex -= 1;
      }
    }

    if (targetSlotIndex < 0) {
      targetSlotIndex = 0;
    }

    if (targetSlotIndex < selectedPartyIds.length) {
      selectedPartyIds[targetSlotIndex] = unitId;
    } else {
      selectedPartyIds.push(unitId);
    }

    appState.saveData.selectedPartyIds = selectedPartyIds.slice(0, MAX_SORTIE_SIZE);
    return unit;
  }

  function getEquipmentModalHost() {
    return getElement("menu-modal-host");
  }

  function closeEquipmentModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    hideFloatingStatTooltip();

    appState.equipmentModal.unitId = null;
    appState.equipmentModal.hoveredItemId = null;
    appState.equipmentModal.hoveredSlotKey = null;
    appState.equipmentModal.previewSlotKey = null;
    appState.equipmentModal.dragItemId = null;
    appState.equipmentModal.page = 1;
  }

  function closeSkillModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    hideFloatingStatTooltip();

    appState.skillModal.unitId = null;
    appState.skillModal.hoveredSkillId = null;
    appState.skillModal.dragSkillId = null;
    appState.skillModal.passivePage = 1;
  }

  function closeDetailModal() {
    const host = getEquipmentModalHost();

    if (host) {
      host.innerHTML = "";
    }

    hideFloatingStatTooltip();

    appState.detailModal.type = null;
    appState.detailModal.id = null;
    appState.detailModal.page = 1;
    appState.pendingEquipAction = null;
    appState.quickSwapSlotIndex = null;
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

  function escapeAttribute(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildPrimaryStatPill(statName, baseValue, previewValue, options) {
    const nextOptions = options || {};
    const label = StatsService.PRIMARY_STAT_LABELS[statName] || statName.toUpperCase();
    const description = StatsService.getPrimaryStatDescription(statName);
    const equipmentBonus = Number(nextOptions.equipmentBonus || 0);
    const draftDelta = Number(nextOptions.draftDelta || 0);
    const bonusParts = [];

    if (equipmentBonus > 0) {
      bonusParts.push(`장비 +${equipmentBonus}`);
    }

    if (draftDelta > 0) {
      bonusParts.push(`예약 +${draftDelta}`);
    }

    return `<span class="meta-pill stat-tooltip-pill ${draftDelta > 0 ? "is-preview-up" : ""}" data-stat-tooltip="${escapeAttribute(description)}">${label} ${previewValue}${bonusParts.length ? ` (${bonusParts.join(" / ")})` : ""}</span>`;
  }

  function wrapMarkupWithTooltip(markup, tooltipText, className) {
    if (!tooltipText) {
      return markup;
    }

    return `<span class="${className || "tooltip-anchor"}" data-stat-tooltip="${escapeAttribute(tooltipText)}">${markup}</span>`;
  }

  function buildEquippedItemBadge(item) {
    const rarity = InventoryService.getRarityMeta(item.rarity);
    const slotLabel = InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot);
    return `<span class="meta-pill rarity-${item.rarity}">${slotLabel}: ${item.name} (${rarity.label})</span>`;
  }

  function simplifyTacticalText(text) {
    const normalized = String(text || "")
      .replace(/병종입니다\./g, ".")
      .replace(/상급 /g, "")
      .replace(/기본 /g, "")
      .replace(/입니다\./g, ".")
      .replace(/합니다\./g, ".")
      .replace(/특화된 /g, "")
      .replace(/안정적인 /g, "안정 ")
      .replace(/원거리 /g, "원딜 ")
      .replace(/근접 /g, "근딜 ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) {
      return "-";
    }

    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  function buildClassProfileMarkup(classProfile) {
    return [
      '<div class="detail-metric-grid compact-profile-grid">',
      buildDetailKeyValue("역할", classProfile.role, "gold"),
      buildDetailKeyValue("운용", simplifyTacticalText(classProfile.summary), "cyan"),
      buildDetailKeyValue("상성", simplifyTacticalText(classProfile.matchup), "violet"),
      buildDetailKeyValue("강점", classProfile.strengths, "violet"),
      buildDetailKeyValue("주의", simplifyTacticalText(classProfile.caution), "muted"),
      "</div>"
    ].join("");
  }

  function buildEquipmentLoadoutMarkup(unitId, options) {
    const nextOptions = options || {};
    const loadout = nextOptions.loadout || InventoryService.getEquipmentLoadout(appState.saveData, unitId);
    const orderedSlots = [
      "weapon",
      "subweapon",
      "head",
      "chest",
      "legs",
      "boots",
      "bracelet",
      "ring",
      "charm"
    ];
    const equippedCount = orderedSlots.filter((slotKey) => !!loadout[slotKey]).length;

    return [
      `<p>장비 ${equippedCount}/${orderedSlots.length}</p>`,
      '<div class="detail-token-list compact-loadout-list">',
      orderedSlots.map((slotKey) => {
        const item = loadout[slotKey];
        const slotLabel = InventoryService.getSlotLabel(slotKey);
        return item
          ? `<span class="detail-token is-stat compact-loadout-token rarity-${item.rarity}"><strong>${slotLabel}</strong><small>${item.name}</small></span>`
          : `<span class="detail-token is-muted compact-loadout-token"><strong>${slotLabel}</strong><small>비어 있음</small></span>`;
      }).join(""),
      "</div>"
    ].join("");
  }

  function buildSortieManagementMarkup() {
    const roster = (appState.saveData && appState.saveData.roster) || [];
    const selectedPartyIds = getSelectedPartyIds().slice(0, MAX_SORTIE_SIZE);
    const selectedPartyMap = new Map(selectedPartyIds.map((unitId, index) => [unitId, index]));
    const selectedUnits = selectedPartyIds
      .map((unitId) => roster.find((entry) => entry.id === unitId))
      .filter(Boolean);
    const sortedRoster = sortPartyRoster(roster, selectedPartyIds);
    const leaderUnit = roster.find((entry) => entry.id === appState.saveData.leaderUnitId) || null;
    const emptySlotCount = Math.max(0, MAX_SORTIE_SIZE - selectedUnits.length);
    const averageLevel = selectedUnits.length
      ? (selectedUnits.reduce((sum, unit) => sum + Number(unit.level || 0), 0) / selectedUnits.length).toFixed(1)
      : "0.0";
    const rankOrder = TavernService.GUILD_RANK_ORDER || ["D", "C", "B", "A", "S", "SS", "SSS"];
    const highestRank = selectedUnits.reduce((best, unit) => {
      const unitRank = unit.guildRank || "D";
      return rankOrder.indexOf(unitRank) > rankOrder.indexOf(best) ? unitRank : best;
    }, "D");
    const filledRatio = `${selectedUnits.length}/${MAX_SORTIE_SIZE}`;
    const classSpread = selectedUnits.length
      ? Array.from(new Set(selectedUnits.map((unit) => unit.className))).slice(0, 3).join(" / ")
      : "미편성";
    const totalPages = Math.max(1, Math.ceil(sortedRoster.length / SORTIE_MANAGER_PAGE_SIZE));
    const currentPage = Math.max(1, Math.min(totalPages, Number(appState.sortieManagerView.page || 1)));
    const pageStart = (currentPage - 1) * SORTIE_MANAGER_PAGE_SIZE;
    const visibleRoster = sortedRoster.slice(pageStart, pageStart + SORTIE_MANAGER_PAGE_SIZE);

    appState.sortieManagerView.page = currentPage;

    return [
      [
        '<div class="item-title-row sortie-manager-header-row">',
        '  <strong class="card-title">출전 파티 편성</strong>',
        '  <div class="inventory-meta sortie-manager-header-meta">',
        `    <span class="meta-pill is-gold">출전 ${selectedPartyIds.length}/${MAX_SORTIE_SIZE}</span>`,
        `    <span class="meta-pill ${appState.quickSwapSlotIndex !== null ? "is-cyan" : "is-muted"}">${appState.quickSwapSlotIndex !== null ? `${appState.quickSwapSlotIndex + 1}번 슬롯 선택 중` : "슬롯을 선택한 뒤 아래 캐릭터를 배치"}</span>`,
        "  </div>",
        "</div>"
      ].join(""),
      '  <div class="sortie-manager-layout">',
      '    <section class="sortie-manager-section">',
      '      <div class="item-title-row"><strong class="card-title">현재 슬롯</strong><span class="card-subtitle">교체 / 제외</span></div>',
      '      <div class="sortie-slot-grid">',
      Array.from({ length: MAX_SORTIE_SIZE }, (_, index) => {
        const unitId = selectedPartyIds[index] || null;
        const unit = unitId ? roster.find((entry) => entry.id === unitId) : null;
        const weapon = unit && unit.weapon ? InventoryService.getItemById(appState.saveData, unit.weapon) : null;
        const classes = ["sortie-slot-card"];

        if (unit) {
          classes.push("is-filled");
        } else {
          classes.push("is-empty");
        }

        if (appState.quickSwapSlotIndex === index) {
          classes.push("is-armed");
        }

        return [
          `<article class="${classes.join(" ")}" data-sortie-slot="${index}">`,
          '  <div class="sortie-slot-heading">',
          `    <strong class="card-title">${unit ? unit.name : `${index + 1}번 슬롯`}</strong>`,
          `    <span class="card-subtitle">${unit ? `${index + 1}번 슬롯 · ${unit.className}` : "EMPTY"}</span>`,
          "  </div>",
          unit
            ? `  <div class="roster-meta"><span class="meta-pill rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(unit.guildRank || "D")}</span><span class="meta-pill">Lv.${unit.level}</span><span class="meta-pill ${appState.saveData.leaderUnitId === unit.id ? "is-gold" : "is-muted"}">${appState.saveData.leaderUnitId === unit.id ? "리더" : "일반"}</span><span class="meta-pill ${weapon ? "is-cyan" : "is-muted"}">${weapon ? `주무기 ${weapon.name}` : "주무기 없음"}</span></div>`
            : '  <div class="roster-meta"><span class="meta-pill is-muted">비어 있음</span></div>',
          '  <div class="button-row">',
          `    <button class="${appState.quickSwapSlotIndex === index ? "primary-button" : "secondary-button"} small-button" type="button" data-sortie-swap="${index}">${appState.quickSwapSlotIndex === index ? "선택 중" : unit ? "교체" : "추가"}</button>`,
          unit ? `    <button class="ghost-button small-button" type="button" data-sortie-remove="${index}">제외</button>` : "",
          unit ? `    <button class="ghost-button small-button" type="button" data-sortie-focus="${unit.id}">상세</button>` : "",
          "  </div>",
          "</article>"
        ].filter(Boolean).join("");
      }).join(""),
      "      </div>",
      '      <div class="summary-card sortie-manager-briefing-card">',
      '        <div class="item-title-row">',
      '          <strong class="card-title">편성 브리핑</strong>',
      `          <span class="card-subtitle">${selectedUnits.length ? "출전 준비 완료" : "편성 필요"}</span>`,
      "        </div>",
      '        <div class="inventory-meta">',
      `          <span class="meta-pill ${leaderUnit ? `rank-${String(leaderUnit.guildRank || "D").toLowerCase().replace("+", "plus")}` : "is-muted"}">${leaderUnit ? `리더 ${formatRankBadge(leaderUnit.guildRank || "D")}` : "리더 없음"}</span>`,
      `          <span class="meta-pill is-cyan">평균 Lv.${averageLevel}</span>`,
      `          <span class="meta-pill is-gold">최고 ${formatRankBadge(highestRank)}</span>`,
      `          <span class="meta-pill ${selectedUnits.length === MAX_SORTIE_SIZE ? "is-cyan" : "is-muted"}">편성률 ${filledRatio}</span>`,
      `          <span class="meta-pill ${emptySlotCount ? "is-gold" : "is-muted"}">빈 슬롯 ${emptySlotCount}</span>`,
      "        </div>",
      `        <p>${leaderUnit ? `${leaderUnit.name}이(가) 현재 작전 리더입니다.` : "리더가 아직 지정되지 않았습니다."}</p>`,
      `        <p>핵심 병종: ${classSpread}</p>`,
      `        <p>${appState.quickSwapSlotIndex !== null
        ? `${appState.quickSwapSlotIndex + 1}번 슬롯이 교체 대기 중입니다. 우측 후보 중 원하는 모험가를 눌러 바로 배치하세요.`
        : emptySlotCount
          ? `아직 ${emptySlotCount}개의 빈 슬롯이 남아 있습니다. 슬롯을 선택하면 우측 후보를 즉시 배치할 수 있습니다.`
          : "출전 슬롯이 가득 찼습니다. 교체할 슬롯을 먼저 선택한 뒤 우측 후보를 배치하세요."}</p>`,
      "      </div>",
      "    </section>",
      '    <section class="sortie-manager-section">',
      `      <div class="item-title-row"><strong class="card-title">보유 모험가</strong><span class="card-subtitle">${currentPage} / ${totalPages} 페이지</span></div>`,
      '      <div class="sortie-candidate-list">',
      visibleRoster.map((unit) => {
        const currentSlot = selectedPartyMap.has(unit.id) ? selectedPartyMap.get(unit.id) + 1 : null;
        const isTarget = appState.quickSwapSlotIndex !== null;
        const rankClass = `rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}`;
        return [
          `<article class="inventory-card sortie-candidate-card ${currentSlot ? "is-in-party" : ""}" draggable="true" data-sortie-drag-unit="${unit.id}">`,
          '  <div>',
          `    <div class="item-title-row"><strong class="card-title">${unit.name}</strong><div class="sortie-candidate-title-meta"><span class="card-subtitle">${unit.className}</span>${currentSlot ? `<span class="sortie-state-badge">편성 중</span>` : ""}</div></div>`,
          `    <div class="inventory-meta"><span class="meta-pill ${rankClass}">${formatRankBadge(unit.guildRank || "D")}</span><span class="meta-pill">Lv.${unit.level}</span><span class="meta-pill ${currentSlot ? "is-gold" : "is-muted"}">${currentSlot ? "배치 중" : "후방 대기"}</span><span class="meta-pill ${currentSlot ? "is-cyan" : "is-muted"}">${currentSlot ? `${currentSlot}번 슬롯` : "미배치"}</span></div>`,
          "  </div>",
          '  <div class="button-row">',
          `    <button class="ghost-button small-button" type="button" data-sortie-focus="${unit.id}">상세</button>`,
          `    <button class="ghost-button small-button" type="button" data-sortie-leader="${unit.id}" ${appState.saveData.leaderUnitId === unit.id ? "disabled" : ""}>${appState.saveData.leaderUnitId === unit.id ? "리더" : "리더 지정"}</button>`,
          `    <button class="${isTarget ? "primary-button" : "secondary-button"} small-button" type="button" data-sortie-assign="${unit.id}" ${isTarget ? "" : "disabled"}>${isTarget ? "여기에 배치" : "슬롯 선택 필요"}</button>`,
          "  </div>",
          "</article>"
        ].join("");
      }).join(""),
      "      </div>",
      '      <div class="list-pagination">',
      `        <button class="ghost-button small-button" type="button" data-sortie-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>`,
      `        <span class="pagination-label">${currentPage} / ${totalPages}</span>`,
      `        <button class="ghost-button small-button" type="button" data-sortie-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`,
      "      </div>",
      "    </section>",
      "  </div>"
    ].join("");
  }

  function renderSortieQuickBar() {
    const target = getElement("menu-sortie-strip");

    if (!target || !appState.saveData) {
      return;
    }

    const roster = appState.saveData.roster || [];
    const selectedPartyIds = getSelectedPartyIds().slice(0, MAX_SORTIE_SIZE);
    const selectedUnits = selectedPartyIds
      .map((unitId) => roster.find((entry) => entry.id === unitId))
      .filter(Boolean);

    target.innerHTML = [
      '<div class="summary-card sortie-strip-card interactive-summary-card" data-open-sortie-manager="true">',
      '  <div class="item-title-row">',
      '    <strong class="card-title">현재 출전 파티</strong>',
      `    <span class="card-subtitle">${selectedUnits.length}/${MAX_SORTIE_SIZE}</span>`,
      "  </div>",
      '  <div class="inventory-meta sortie-strip-meta">',
      selectedUnits.length
        ? selectedUnits.map((unit, index) => `<span class="meta-pill ${appState.selectedMenuUnitId === unit.id ? "is-gold" : ""}">${index + 1}. ${unit.name}</span>`).join("")
        : '<span class="meta-pill is-muted">아직 출전 파티가 비어 있습니다.</span>',
      '    <button class="primary-button small-button inventory-meta-action" type="button" data-open-sortie-manager="true">편성 관리</button>',
      "  </div>",
      '  <p class="sortie-strip-helper">상단 바는 요약만 보여주고, 편성 교체는 중앙 모달에서 진행합니다.</p>',
      "</div>"
    ].join("");

    target.querySelectorAll("[data-open-sortie-manager]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal("sortie", "party");
      });
    });

    const card = target.querySelector("[data-open-sortie-manager]");

    if (card) {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        openDetailModal("sortie", "party");
      });
    }
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

  function hasAvailableStatDraftTarget(previewPrimaryStats, remainingStatPoints) {
    if (Number(remainingStatPoints || 0) <= 0) {
      return false;
    }

    return StatsService.PRIMARY_STATS.some((statName) => (
      Number(previewPrimaryStats[statName] || 0) < Number(StatsService.STAT_LIMITS[statName] || 0)
    ));
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
    const tooltip = escapeAttribute(skill.description || "");

    if (isActive && skill.skillLevel) {
      badgeParts.push(`Lv.${skill.skillLevel}`);
    }

    if (nextOptions.slotLabel) {
      badgeParts.push(nextOptions.slotLabel);
    }

    return `<span class="meta-pill ${tooltip ? "stat-tooltip-pill" : ""} ${isActive ? "is-cyan" : ""} ${nextOptions.isEquipped ? "is-gold" : ""}" ${tooltip ? `data-stat-tooltip="${tooltip}"` : ""}>${badgeParts.join(" · ")}</span>`;
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

  function resolveSkillDetailSelection(unit, preferredSkillId) {
    if (!unit) {
      return null;
    }

    const loadout = SkillsService.getActiveSkillLoadout(unit).filter(Boolean);
    const activeSkills = SkillsService.getActiveSkillsForUnit(unit);
    const passiveSkills = SkillsService.getSkillsForUnit(unit);
    const skillPool = [...loadout, ...activeSkills, ...passiveSkills];

    if (!skillPool.length) {
      return null;
    }

    return skillPool.find((skill) => skill.id === preferredSkillId) || skillPool[0];
  }

  function normalizeSkillForDetail(unit, skill) {
    if (!unit || !skill) {
      return null;
    }

    const skillLevel = skill.skillType === "active"
      ? Math.max(1, Number(skill.skillLevel || SkillsService.getSkillLevel(unit, skill.id) || 1))
      : null;
    const maxSkillLevel = skill.skillType === "active"
      ? Math.max(skillLevel || 1, Number(skill.maxSkillLevel || SkillsService.getSkillMaxLevel(unit, skill) || 1))
      : null;

    return {
      ...skill,
      skillLevel,
      maxSkillLevel,
      canLevelUp: skill.skillType === "active" ? (skillLevel < maxSkillLevel) : false
    };
  }

  function buildSkillDetailMarkup(unit, skillId) {
    if (!unit) {
      return "<p>스킬 정보를 표시할 수 없습니다.</p>";
    }

    const selectedSkill = resolveSkillDetailSelection(unit, skillId);

    if (!selectedSkill) {
      return [
        `<div class="item-title-row"><strong class="card-title">${unit.name} 스킬 상세</strong><span class="card-subtitle">${unit.className}</span></div>`,
        "  <p>장착하거나 확인할 스킬이 없습니다.</p>"
      ].join("");
    }

    const detailedSkill = normalizeSkillForDetail(unit, selectedSkill);
    const performance = SkillsService.getSkillPerformance(unit, detailedSkill);
    const equippedSlotIndex = detailedSkill.skillType === "active"
      ? (unit.equippedActiveSkillIds || []).indexOf(detailedSkill.id)
      : -1;
    const formulaLines = performance && performance.formulaLines ? performance.formulaLines.slice(0, 2) : [];
    const formulaOverflowCount = performance && performance.formulaLines
      ? Math.max(0, performance.formulaLines.length - formulaLines.length)
      : 0;

    return [
      `<div class="item-title-row"><strong class="card-title">${detailedSkill.name}</strong><span class="card-subtitle">${detailedSkill.skillType === "active" ? "ACTIVE" : "PASSIVE"}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${detailedSkill.skillType === "active" ? "is-cyan" : "is-gold"}">${detailedSkill.skillType === "active" ? "액티브" : "패시브"}</span>`,
      detailedSkill.skillType === "active" ? `    <span class="meta-pill">Lv.${detailedSkill.skillLevel} / 최대 ${detailedSkill.maxSkillLevel}</span>` : "",
      detailedSkill.skillType === "active" && equippedSlotIndex >= 0 ? `    <span class="meta-pill is-gold">${getSkillSlotLabel(equippedSlotIndex)}</span>` : "",
      `    <span class="meta-pill">개방 Lv.${detailedSkill.unlockLevel}</span>`,
      detailedSkill.sourceClassName && detailedSkill.sourceClassName !== "special" ? `    <span class="meta-pill is-muted">${detailedSkill.sourceClassName}</span>` : "",
      "  </div>",
      '  <div class="detail-metric-grid skill-detail-metrics">',
      detailedSkill.skillType === "active"
        ? [
          buildDetailKeyValue("대상", getSkillTargetLabel(detailedSkill), "cyan"),
          buildDetailKeyValue("사거리", getSkillRangeLabel(detailedSkill), "violet"),
          buildDetailKeyValue("재사용", `${detailedSkill.cooldown}턴`, "gold"),
          buildDetailKeyValue("지형", getSkillTerrainLabel(detailedSkill), "muted")
        ].join("")
        : [
          buildDetailKeyValue("분류", "상시 패시브", "gold"),
          buildDetailKeyValue("출처", detailedSkill.sourceClassName === "special" ? "특수" : (detailedSkill.sourceClassName || "공통"), "muted"),
          buildDetailKeyValue("개방", `Lv.${detailedSkill.unlockLevel}`, "cyan"),
          buildDetailKeyValue("상태", "항상 적용", "violet")
        ].join(""),
      "  </div>",
      '  <div class="skill-detail-grid">',
      '    <section class="skill-detail-pane">',
      '      <div class="detail-feature-title">운용 개요</div>',
      `      <p class="skill-detail-copy">${detailedSkill.description}</p>`,
      detailedSkill.skillType === "active"
        ? `      <p class="skill-detail-note">장착 상태: ${equippedSlotIndex >= 0 ? `${getSkillSlotLabel(equippedSlotIndex)} 배치` : "미장착"}</p>`
        : `      <p class="skill-detail-note">${detailedSkill.sourceClassName === "special" ? "특수 패시브로 자동 적용됩니다." : "습득 시 자동 적용되는 지속 효과입니다."}</p>`,
      "    </section>",
      '    <section class="skill-detail-pane">',
      '      <div class="detail-feature-title">현재 성능</div>',
      performance
        ? `      <p class="skill-detail-copy skill-detail-current">${performance.currentSummary}</p>`
        : '      <p class="skill-detail-copy">현재 수치가 필요한 능동 효과는 없습니다.</p>',
      formulaLines.length
        ? `      <div class="skill-detail-note-list">${formulaLines.map((line) => `<p class="skill-detail-note">${line}</p>`).join("")}${formulaOverflowCount ? `<p class="skill-detail-note">추가 계산식 ${formulaOverflowCount}개</p>` : ""}</div>`
        : "",
      detailedSkill.canLevelUp
        ? '      <p class="skill-detail-note is-upgrade">현재 레벨 기준으로 더 강화할 수 있습니다.</p>'
        : (detailedSkill.skillType === "active" && detailedSkill.skillLevel >= detailedSkill.maxSkillLevel
          ? '      <p class="skill-detail-note">현재 레벨에서 가능한 최대 스킬 레벨입니다.</p>'
          : ""),
      "    </section>",
      "  </div>"
    ].filter(Boolean).join("");
  }

  function buildUnitStatSummary(unit) {
    const primaryStats = StatsService.getPrimaryStats(unit);
    return StatsService.PRIMARY_STATS.map((statName) => (
      `<span class="meta-pill stat-tooltip-pill" data-stat-tooltip="${escapeAttribute(StatsService.getPrimaryStatDescription(statName))}">${StatsService.PRIMARY_STAT_LABELS[statName]} ${primaryStats[statName]}</span>`
    )).join("");
  }

  function buildDetailKeyValue(label, value, tone) {
    return [
      `<div class="detail-kv${tone ? ` is-${tone}` : ""}">`,
      `  <span class="detail-kv-label">${label}</span>`,
      `  <strong class="detail-kv-value">${value}</strong>`,
      "</div>"
    ].join("");
  }

  function getMaxReachableGuildRank(unit) {
    if (!unit) {
      return "D";
    }

    const trainingCap = StatsService.getTrainingCap(unit);
    let currentRank = unit.guildRank || "D";

    while (true) {
      const requirement = TavernService.getRankPromotionRequirement({
        guildRank: currentRank,
        level: 999,
        trainingLevel: 999
      });

      if (!requirement || !requirement.nextRank || requirement.minTrainingLevel > trainingCap) {
        return currentRank;
      }

      currentRank = requirement.nextRank;
    }
  }

  function buildGrowthInfoHelpMarkup(unit) {
    if (!unit) {
      return "";
    }

    const potentialMeta = StatsService.getPotentialMeta(unit);
    const trainingCap = StatsService.getTrainingCap(unit);
    const reachableRank = getMaxReachableGuildRank(unit);

    return [
      '<details class="detail-help-box">',
      '  <summary class="ghost-button small-button detail-help-button" aria-label="잠재력과 승급 안내">?</summary>',
      '  <div class="detail-help-popover">',
      '    <strong>잠재력 / 승급 안내</strong>',
      `    <p>${potentialMeta.label} 잠재력은 훈련 최대 ${trainingCap}단계까지 가능합니다.</p>`,
      '    <p>승급은 레벨, 훈련 단계, 골드가 모두 필요합니다.</p>',
      `    <p>현재 잠재력 기준 최고 도달 가능 등급은 ${reachableRank}입니다.</p>`,
      '    <p>등급 승급 후에도 훈련 단계는 유지됩니다.</p>',
      '  </div>',
      '</details>'
    ].join("");
  }

  function buildProgressionStatButtonsMarkup(unit, previewPrimaryStats, remainingStatPoints) {
    if (!unit) {
      return "";
    }

    const canSpendStats = hasAvailableStatDraftTarget(previewPrimaryStats, remainingStatPoints);

    return [
      `<div class="detail-stats progression-stat-buttons ${canSpendStats ? "is-available" : "is-empty"}">`,
      StatsService.PRIMARY_STATS.map((statName) => {
        const isLimited = Number(previewPrimaryStats[statName] || 0) >= Number(StatsService.STAT_LIMITS[statName] || 0);
        return `<button class="ghost-button small-button progression-stat-button" type="button" data-menu-stat-draft="${statName}" ${!canSpendStats || isLimited ? "disabled" : ""}>+ ${StatsService.PRIMARY_STAT_LABELS[statName]}</button>`;
      }).join(""),
      "</div>"
    ].join("");
  }

  function buildItemFeatureSection(title, bodyMarkup, toneClass, headerExtraMarkup) {
    if (!bodyMarkup) {
      return "";
    }

    return [
      `<section class="detail-feature-card${toneClass ? ` ${toneClass}` : ""}">`,
      '  <div class="detail-feature-header">',
      `    <div class="detail-feature-title">${title}</div>`,
      `    ${headerExtraMarkup || ""}`,
      "  </div>",
      `  <div class="detail-feature-body">${bodyMarkup}</div>`,
      "</section>"
    ].join("");
  }

  function buildItemMetricGrid(item, extraEntries) {
    const metrics = [];

    if (InventoryService.isWeapon(item)) {
      metrics.push(buildDetailKeyValue("위력", item.might || 0, "gold"));
      metrics.push(buildDetailKeyValue("명중", item.hit || 0, "cyan"));
      metrics.push(buildDetailKeyValue("사거리", `${item.rangeMin}-${item.rangeMax}`, "violet"));
      metrics.push(buildDetailKeyValue("내구", item.uses || 0, "muted"));
    } else if (InventoryService.isConsumable(item)) {
      metrics.push(buildDetailKeyValue("분류", "소모품", "gold"));
    } else {
      metrics.push(buildDetailKeyValue("장비 부위", InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot), "gold"));
      metrics.push(buildDetailKeyValue("종류", InventoryService.getTypeLabel(item.type || item.slot), "cyan"));
    }

    (extraEntries || []).forEach((entry) => {
      metrics.push(buildDetailKeyValue(entry.label, entry.value, entry.tone));
    });

    return metrics.join("");
  }

  function buildAffixListMarkup(item) {
    if (!item.affixes || !item.affixes.length) {
      return '<div class="detail-token-list"><span class="detail-token is-muted">추가 옵션 없음</span></div>';
    }

    return [
      '<div class="detail-token-list">',
      item.affixes.map((affix) => (
        `<span class="detail-token ${affix.isUnique ? "is-unique" : "is-normal"}"><strong>${affix.isUnique ? "고유" : "옵션"}</strong> ${affix.label}<small>${affix.description}</small></span>`
      )).join(""),
      "</div>"
    ].join("");
  }

  function buildEquipmentDetailTokenList(entries, emptyText = "정보 없음") {
    const filteredEntries = (entries || []).filter((entry) => (
      entry
      && entry.value !== undefined
      && entry.value !== null
      && entry.value !== ""
    ));

    if (!filteredEntries.length) {
      return `<div class="detail-token-list equipment-detail-token-grid"><span class="detail-token is-muted">${emptyText}</span></div>`;
    }

    return [
      '<div class="detail-token-list equipment-detail-token-grid">',
      filteredEntries.map((entry) => {
        const classes = ["detail-token"];

        if (entry.variant) {
          classes.push(entry.variant);
        }

        if (entry.className) {
          classes.push(entry.className);
        }

        return `<span class="${classes.join(" ")}"><strong>${entry.label}</strong><small>${entry.value}</small></span>`;
      }).join(""),
      "</div>"
    ].join("");
  }

  function buildCompactEquipmentBadgeList(entries, emptyText) {
    const filteredEntries = (entries || []).filter(Boolean);

    if (!filteredEntries.length) {
      return emptyText
        ? `<span class="equipment-detail-muted-text">${emptyText}</span>`
        : "";
    }

    return [
      '<div class="equipment-detail-chip-list">',
      filteredEntries.map((entry) => {
        if (typeof entry === "string") {
          return `<span class="equipment-detail-chip">${entry}</span>`;
        }

        const classes = ["equipment-detail-chip"];

        if (entry.className) {
          classes.push(entry.className);
        }

        return `<span class="${classes.join(" ")}">${entry.text}</span>`;
      }).join(""),
      "</div>"
    ].join("");
  }

  function buildCompactEquipmentInfoRow(label, bodyMarkup) {
    return [
      '<div class="equipment-detail-info-row">',
      `  <span class="equipment-detail-info-label">${label}</span>`,
      `  <div class="equipment-detail-info-body">${bodyMarkup}</div>`,
      '</div>'
    ].join("");
  }

  function buildEquipmentSlotTooltipMarkup(item, slotMeta) {
    if (!item) {
      return "";
    }

    const rarity = InventoryService.getRarityMeta(item.rarity);
    const statSummary = InventoryService.formatStatBonusLine(item);
    const statEntries = statSummary !== "추가 능력치 없음"
      ? statSummary.split(" / ").map((entry) => ({ text: entry, className: "is-cyan" }))
      : [];
    const affixEntries = (item.affixes || []).map((affix) => ({
      text: affix.label,
      className: affix.isUnique ? "is-unique" : ""
    }));

    return [
      '<div class="equipment-slot-tooltip">',
      `  <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${slotMeta ? slotMeta.label : InventoryService.getSlotLabel(item.equippedSlotKey || item.slot)}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill rarity-${item.rarity}">${rarity.label}</span>`,
      `    <span class="meta-pill is-cyan">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
      "  </div>",
      `  ${buildCompactEquipmentInfoRow("능력치", buildCompactEquipmentBadgeList(statEntries, "추가 능력치 없음"))}`,
      `  ${buildCompactEquipmentInfoRow("옵션", buildCompactEquipmentBadgeList(affixEntries, "추가 옵션 없음"))}`,
      "</div>"
    ].join("");
  }

  function buildSetDetailMarkup(setDefinition) {
    if (!setDefinition) {
      return "";
    }

    return [
      '<div class="detail-set-list">',
      setDefinition.bonuses.map((bonus) => (
        `<div class="detail-set-row"><span class="detail-set-count">${bonus.pieces}세트</span><span class="detail-set-text">${bonus.description}</span></div>`
      )).join(""),
      "</div>"
    ].join("");
  }

  function buildInventoryItemDetailMarkup(item) {
    const rarity = InventoryService.getRarityMeta(item.rarity);
    const ownerText = item.equippedBy
      ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}`
      : "미장착";
    const setDefinition = item.setId ? InventoryService.getSetDefinition(item.setId) : null;
    const statSummary = InventoryService.formatStatBonusLine(item);
    const equipmentLevel = InventoryService.getEquipmentItemLevel(item);

    return [
      `<div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
      '  <div class="inventory-meta detail-hero-meta">',
      `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
      `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
      setDefinition ? `    <span class="meta-pill is-gold">${setDefinition.name}</span>` : "",
      "  </div>",
      `<section class="detail-hero-card rarity-${item.rarity}">`,
      `  <div class="detail-hero-copy">`,
      `    <div class="detail-hero-label">ITEM PROFILE</div>`,
      `    <h3>${item.baseName || item.name}</h3>`,
      `    <p>${item.description || (InventoryService.isConsumable(item) ? "즉시 사용하는 전투 소모품입니다." : "전투 빌드를 만드는 핵심 장비입니다.")}</p>`,
      "  </div>",
      `  <div class="detail-metric-grid">${buildItemMetricGrid(item, InventoryService.isEquipment(item) ? [
        equipmentLevel ? { label: "장비 레벨", value: `Lv.${equipmentLevel}`, tone: "violet" } : null,
        { label: "희귀도", value: rarity.label, tone: "gold" },
        { label: "장착", value: ownerText, tone: item.equippedBy ? "cyan" : "muted" }
      ].filter(Boolean) : [{ label: "희귀도", value: rarity.label, tone: "gold" }])}</div>`,
      "</section>",
      buildItemFeatureSection("기본 요약", `<p class="detail-summary-copy">${InventoryService.describeItem(item)}</p>`, "is-summary"),
      buildItemFeatureSection("능력치", statSummary !== "추가 능력치 없음"
        ? `<div class="detail-token-list">${statSummary.split(" / ").map((entry) => `<span class="detail-token is-stat">${entry}</span>`).join("")}</div>`
        : '<div class="detail-token-list"><span class="detail-token is-muted">추가 능력치 없음</span></div>', "is-stats"),
      buildItemFeatureSection("추가 옵션", buildAffixListMarkup(item), "is-affix"),
      setDefinition ? buildItemFeatureSection("세트 효과", buildSetDetailMarkup(setDefinition), "is-set") : ""
    ].filter(Boolean).join("");
  }

  function buildCompactEquipmentItemDetailMarkup(item) {
    const rarity = InventoryService.getRarityMeta(item.rarity);
    const ownerText = item.equippedBy
      ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}`
      : "미장착";
    const setDefinition = item.setId ? InventoryService.getSetDefinition(item.setId) : null;
    const statSummary = InventoryService.formatStatBonusLine(item);
    const equipmentLevel = InventoryService.getEquipmentItemLevel(item);
    const compatibleSlotLabel = InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot);
    const combatEntries = InventoryService.isWeapon(item)
      ? [
          { text: `위력 ${item.might || 0}`, className: "is-cyan" },
          { text: `명중 ${item.hit || 0}` },
          { text: `사거리 ${item.rangeMin}-${item.rangeMax}`, className: "is-violet" },
          { text: `내구 ${item.uses || 0}` }
        ]
      : [
          { text: `장비 부위 ${compatibleSlotLabel}`, className: "is-cyan" }
        ];
    const statusEntries = [
      equipmentLevel ? { text: `장비 Lv.${equipmentLevel}`, className: "is-violet" } : null,
      { text: item.equippedBy ? "장착 중" : "미장착", className: item.equippedBy ? "is-cyan" : "is-muted" },
      item.equippedBy ? { text: ownerText } : null,
      setDefinition ? { text: setDefinition.name, className: "is-gold" } : null
    ];
    const statMarkup = buildCompactEquipmentBadgeList(
      statSummary !== "추가 능력치 없음" ? statSummary.split(" / ") : [],
      "추가 능력치 없음"
    );
    const affixMarkup = buildCompactEquipmentBadgeList(
      (item.affixes || []).map((affix) => ({
        text: affix.label,
        className: affix.isUnique ? "is-unique" : ""
      })),
      "추가 옵션 없음"
    );

    return [
      '<div class="item-title-row equipment-detail-title-row">',
      `  <strong class="card-title">${item.name}</strong>`,
      '  <div class="inventory-meta detail-hero-meta">',
      `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
      `    <span class="meta-pill rarity-${item.rarity}">${rarity.label}</span>`,
      `    <span class="meta-pill is-violet">${InventoryService.isWeapon(item) ? `${item.rangeMin}-${item.rangeMax} 사거리` : compatibleSlotLabel}</span>`,
      "  </div>",
      "</div>",
      '<div class="equipment-detail-layout-split">',
      '<div class="equipment-detail-compact-head">',
      `  ${buildCompactEquipmentInfoRow("전투", buildCompactEquipmentBadgeList(combatEntries, "정보 없음"))}`,
      `  ${buildCompactEquipmentInfoRow("상태", buildCompactEquipmentBadgeList(statusEntries, "미장착"))}`,
      "</div>",
      '<div class="equipment-detail-compact-side">',
      `  ${buildCompactEquipmentInfoRow("능력치", statMarkup)}`,
      `  ${buildCompactEquipmentInfoRow("옵션", affixMarkup)}`,
      "</div>",
      "</div>",
    ].filter(Boolean).join("");
  }

  function buildEquipTargetPickerMarkup(item) {
    const roster = (appState.saveData && appState.saveData.roster) || [];
    const selectedPartyIds = getSelectedPartyIds().slice(0, MAX_SORTIE_SIZE);
    const selectedPartyMap = new Map(selectedPartyIds.map((unitId, index) => [unitId, index + 1]));
    const sortedRoster = sortPartyRoster(roster, selectedPartyIds);
    const compatibleTypeLabel = InventoryService.getTypeLabel(item.type || item.slot);
    const totalPages = Math.max(1, Math.ceil(sortedRoster.length / EQUIP_TARGET_MODAL_PAGE_SIZE));
    const currentPage = Math.max(1, Math.min(totalPages, Number(appState.detailModal.page || 1)));
    const pageStart = (currentPage - 1) * EQUIP_TARGET_MODAL_PAGE_SIZE;
    const visibleRoster = sortedRoster.slice(pageStart, pageStart + EQUIP_TARGET_MODAL_PAGE_SIZE);

    appState.detailModal.page = currentPage;

    return [
      `<div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${compatibleTypeLabel}</span></div>`,
      '  <div class="equip-target-summary-row">',
      '    <div class="inventory-meta">',
      `      <span class="meta-pill rarity-${item.rarity}">${InventoryService.getRarityMeta(item.rarity).label}</span>`,
      `      <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${item.equippedBy ? `${getUnitNameById(item.equippedBy)} 장착 중` : "미장착"}</span>`,
      "    </div>",
      '    <p class="equip-target-summary-copy">장착할 캐릭터를 고르면 해당 캐릭터의 장착 관리 창이 열립니다.</p>',
      "  </div>",
      ...(visibleRoster.length ? visibleRoster : [null]).map((unit) => {
        if (!unit) {
          return '<div class="inventory-card">장착 가능한 모험가가 없습니다.</div>';
        }

        const canEquip = InventoryService.canEquip(appState.saveData, unit, item);
        const isSelected = appState.selectedMenuUnitId === unit.id;
        const currentSlot = selectedPartyMap.get(unit.id) || null;
        const rankClass = `rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}`;
        return [
          `  <article class="inventory-card compact-card equip-target-card ${currentSlot ? "is-in-party" : ""} ${canEquip ? "" : "locked"}">`,
          '    <div>',
          `      <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
          `      <div class="inventory-meta"><span class="meta-pill ${rankClass}">${formatRankBadge(unit.guildRank || "D")}</span><span class="meta-pill">Lv.${unit.level}</span><span class="meta-pill ${currentSlot ? "is-gold" : "is-muted"}">${currentSlot ? "편성 중" : "후방 대기"}</span><span class="meta-pill ${currentSlot ? "is-cyan" : "is-muted"}">${currentSlot ? `${currentSlot}번 슬롯` : "미편성"}</span><span class="meta-pill ${isSelected ? "is-gold" : "is-muted"}">${isSelected ? "현재 선택" : "선택 가능"}</span></div>`,
          "    </div>",
          '    <div class="button-row">',
          `      <button class="${canEquip ? "primary-button" : "ghost-button"} small-button" type="button" data-equip-now-unit="${unit.id}" ${canEquip ? "" : "disabled"}>${canEquip ? "바로 장착" : "장착 불가"}</button>`,
          `      <button class="${canEquip ? "secondary-button" : "ghost-button"} small-button" type="button" data-equip-target-unit="${unit.id}" ${canEquip ? "" : "disabled"}>${canEquip ? "장착 창" : "열기 불가"}</button>`,
          "    </div>",
          "  </article>"
        ].join("");
      }),
      totalPages > 1
        ? [
            '  <div class="list-pagination equip-target-pagination">',
            `    <button class="ghost-button small-button" type="button" data-equip-target-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>`,
            `    <span class="pagination-label">${currentPage} / ${totalPages}</span>`,
            `    <button class="ghost-button small-button" type="button" data-equip-target-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`,
            "  </div>"
          ].join("")
        : ""
    ].join("");
  }

  function resolveEquipAction(unit, item) {
    const loadout = InventoryService.getEquipmentLoadout(appState.saveData, unit.id);
    const compatibleSlotKeys = InventoryService.getCompatibleSlotKeys(item)
      .filter((slotKey) => InventoryService.canEquipIntoSlot(appState.saveData, unit, item, slotKey));
    const targetSlotKey = compatibleSlotKeys.find((slotKey) => {
      const equippedItem = loadout[slotKey];
      return !equippedItem || equippedItem.id === item.id;
    }) || compatibleSlotKeys[0] || null;
    const replacedItem = targetSlotKey ? loadout[targetSlotKey] : null;

    return {
      targetSlotKey,
      replacedItem: replacedItem && replacedItem.id !== item.id ? replacedItem : null
    };
  }

  function buildShopProductDetailMarkup(product) {
    const rarity = InventoryService.getRarityMeta(product.rarity);
    const statSummary = InventoryService.formatStatBonusLine(product);

    return [
      `<div class="item-title-row"><strong class="card-title">${product.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
      '  <div class="inventory-meta detail-hero-meta">',
      `    <span class="meta-pill">${InventoryService.getTypeLabel(product.type || product.slot)}</span>`,
      `    <span class="meta-pill is-gold">${product.price}G</span>`,
      `    <span class="meta-pill ${appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "is-cyan" : "is-muted"}">${appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "구매 가능" : "골드 부족"}</span>`,
      "  </div>",
      `<section class="detail-hero-card rarity-${product.rarity}">`,
      `  <div class="detail-hero-copy">`,
      '    <div class="detail-hero-label">SUPPLY ISSUE</div>',
      `    <h3>${product.name}</h3>`,
      `    <p>${product.description || "보급 상점에서 구매 가능한 장비입니다."}</p>`,
      "  </div>",
      `  <div class="detail-metric-grid">${buildItemMetricGrid(product, [
        { label: "희귀도", value: rarity.label, tone: "gold" },
        { label: "가격", value: `${product.price}G`, tone: "gold" },
        { label: "상태", value: appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "구매 가능" : "골드 부족", tone: appState.saveData && (appState.saveData.partyGold || 0) >= product.price ? "cyan" : "muted" }
      ])}</div>`,
      "</section>",
      buildItemFeatureSection("기본 요약", `<p class="detail-summary-copy">${InventoryService.describeItem(product)}</p>`, "is-summary"),
      buildItemFeatureSection("능력치", statSummary !== "추가 능력치 없음"
        ? `<div class="detail-token-list">${statSummary.split(" / ").map((entry) => `<span class="detail-token is-stat">${entry}</span>`).join("")}</div>`
        : '<div class="detail-token-list"><span class="detail-token is-muted">추가 능력치 없음</span></div>', "is-stats")
    ].filter(Boolean).join("");
  }

  function buildTavernCandidateDetailMarkup(candidate) {
    const unit = candidate.unit;
    const rankClass = `rank-${String(candidate.guildRank || "D").toLowerCase().replace("+", "plus")}`;
    const classProfile = SkillsService.getClassProfile(unit);
    const signaturePassives = getSignaturePassiveDefinitions(unit, candidate);
    const potentialMeta = StatsService.getPotentialMeta(unit);
    const startingWeaponLabel = candidate.startingWeapon
      ? candidate.startingWeapon.name
      : "없음";

    return [
      `<div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '  <div class="inventory-meta">',
      `    <span class="meta-pill ${rankClass}">${candidate.guildRank}</span>`,
      `    <span class="meta-pill">${candidate.rankTitle}</span>`,
      `    <span class="meta-pill">Lv.${unit.level}</span>`,
      `    ${buildPotentialPill(unit)}`,
      `    <span class="meta-pill ${signaturePassives.length ? "is-cyan" : "is-muted"}">고유 ${signaturePassives.length}개</span>`,
      `    <span class="meta-pill is-gold">${candidate.hireCost}G</span>`,
      candidate.recruitedAt ? '    <span class="meta-pill is-cyan">영입 완료</span>' : "",
      "  </div>",
      `  <div class="detail-stats">${buildUnitStatSummary(unit)}</div>`,
      buildItemFeatureSection("성장 정보", [
        '<div class="detail-metric-grid">',
        buildDetailKeyValue("잠재력", potentialMeta.label, "violet"),
        buildDetailKeyValue("훈련 상한", `${StatsService.getTrainingCap(unit)}단계`, "cyan"),
        buildDetailKeyValue("고유 패시브", `${signaturePassives.length}개`, signaturePassives.length ? "gold" : "muted"),
        buildDetailKeyValue("시작 장비", startingWeaponLabel, "gold"),
        "</div>"
      ].join(""), "is-summary"),
      buildItemFeatureSection("병종 운용", [
        `<p>${classProfile.role} / ${classProfile.summary}</p>`,
        `<p>강점: ${classProfile.strengths}</p>`,
        `<p>주의: ${classProfile.caution}</p>`
      ].join(""), "is-stats"),
      buildItemFeatureSection("고유 패시브", signaturePassives.length
        ? `<div class="detail-token-list">${signaturePassives.map((skill) => `<span class="detail-token is-unique"><strong>${skill.name}</strong><small>${skill.description}</small></span>`).join("")}</div>`
        : '<div class="detail-token-list"><span class="detail-token is-muted">이번 명단에는 고유 패시브가 없습니다.</span></div>', "is-affix"),
      buildItemFeatureSection("보유 스킬", [
        `  <p>패시브: ${SkillsService.describeSkills(unit)}</p>`,
        `  <p>액티브: ${SkillsService.describeActiveSkills(unit)}</p>`
      ].join(""), "is-set")
    ].filter(Boolean).join("");
  }

  function buildUnitFullDetailMarkup(unit, options) {
    if (!unit || !appState.saveData) {
      return "<p>캐릭터 정보를 표시할 수 없습니다.</p>";
    }

    const nextOptions = options || {};
    const isReadOnly = !!nextOptions.readOnly;
    const tavernCandidate = nextOptions.candidate || null;
    const draft = isReadOnly ? { stats: {}, skillIds: [] } : getProgressionDraft(unit.id);
    const previewUnit = StatsService.previewUnitWithStatDraft(unit, draft.stats);
    const effectivePreviewUnit = InventoryService.getEffectiveUnitStats(appState.saveData, previewUnit);
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
    const learnableSkills = SkillsService.getLearnableSkills(unit);
    const learnableActiveSkills = SkillsService.getLearnableActiveSkills(unit);
    const pendingSkillSummaries = draft.skillIds
      .map((skillId) => SkillsService.getSkillDefinition(unit, skillId))
      .filter(Boolean)
      .map((skill) => `<span class="meta-pill is-preview-up">${skill.name}</span>`)
      .join("");
    const signaturePassives = getSignaturePassiveDefinitions(unit, tavernCandidate || undefined);
    const equippedItems = InventoryService.getEquippedItems(appState.saveData, unit.id)
      .map((item) => buildEquippedItemBadge(item))
      .join("");
    const potentialMeta = StatsService.getPotentialMeta(unit);
    const trainingCost = TavernService.getTrainingCost(unit);
    const canTrain = (unit.trainingLevel || 0) < StatsService.getTrainingCap(unit);
    const guildPromotion = TavernService.getRankPromotionRequirement(unit);
    const promotionOptions = SkillsService.getPromotionOptions(unit);
    const lockedPromotions = SkillsService.PROMOTION_TREE[unit.className] || [];
    const tavernPreviewLoadout = (() => {
      if (!isReadOnly || !tavernCandidate || !tavernCandidate.startingWeapon) {
        return null;
      }

      const previewLoadout = {};
      const compatibleSlots = InventoryService.getCompatibleSlotKeys(tavernCandidate.startingWeapon);
      const baseSlotKey = compatibleSlots[0] || tavernCandidate.startingWeapon.slot || "weapon";
      previewLoadout[baseSlotKey] = tavernCandidate.startingWeapon;
      return previewLoadout;
    })();
    const dismissDisabledReason = (appState.saveData.roster || []).length <= 1
      ? "파티에 마지막 1명만 남아 있으면 방출할 수 없습니다."
      : (appState.saveData.stageStatus === "in_progress" && appState.saveData.battleState
        ? "진행 중인 전투가 있을 때는 캐릭터를 방출할 수 없습니다."
        : "");
    const dismissDisabled = (appState.saveData.roster || []).length <= 1
      || (appState.saveData.stageStatus === "in_progress" && !!appState.saveData.battleState);
    const dismissButtonMarkup = wrapMarkupWithTooltip(
      `<button class="ghost-button small-button" type="button" data-dismiss-unit="true" ${dismissDisabled ? "disabled" : ""}>방출</button>`,
      dismissDisabled ? dismissDisabledReason : "",
      "tooltip-anchor button-tooltip-anchor"
    );
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

    const topMetaMarkup = isReadOnly && tavernCandidate
      ? [
        `    <span class="meta-pill rank-${String(tavernCandidate.guildRank || unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(tavernCandidate.guildRank || unit.guildRank || "D")}</span>`,
        tavernCandidate.rankTitle ? `    <span class="meta-pill">${tavernCandidate.rankTitle}</span>` : "",
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    ${buildPotentialPill(unit)}`,
        `    <span class="meta-pill ${signaturePassives.length ? "is-cyan" : "is-muted"}">고유 ${signaturePassives.length}</span>`,
        `    <span class="meta-pill is-gold">${tavernCandidate.hireCost || 0}G</span>`,
        tavernCandidate.recruitedAt ? '    <span class="meta-pill is-cyan">영입 완료</span>' : '    <span class="meta-pill is-muted">주점 대기</span>',
        tavernCandidate.startingWeapon ? `    <span class="meta-pill is-cyan">${tavernCandidate.startingWeapon.name}</span>` : ""
      ].filter(Boolean).join("")
      : [
        `    <span class="meta-pill rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(unit.guildRank || "D")}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill">EXP ${unit.exp}</span>`,
        `    ${buildPotentialPill(unit)}`,
        `    <span class="meta-pill ${canTrain ? "is-cyan" : "is-muted"}">훈련 ${unit.trainingLevel || 0}/${StatsService.getTrainingCap(unit)}</span>`,
        `    <span class="meta-pill is-gold">스탯 ${remainingStatPoints}</span>`,
        `    <span class="meta-pill is-cyan">스킬 ${remainingSkillPoints}</span>`,
        `    <span class="meta-pill ${isUnitSelectedForSortie(unit.id) ? "is-cyan" : "is-muted"}">${isUnitSelectedForSortie(unit.id) ? "출전 중" : "후방 대기"}</span>`,
        `    <span class="meta-pill ${appState.saveData.leaderUnitId === unit.id ? "is-gold" : "is-muted"}">${appState.saveData.leaderUnitId === unit.id ? "리더" : "일반"}</span>`
      ].join("");

    const growthSectionMarkup = isReadOnly && tavernCandidate
      ? [
        '<div class="detail-metric-grid">',
        buildDetailKeyValue("잠재력", potentialMeta.label, "violet"),
        buildDetailKeyValue("길드 등급", tavernCandidate.guildRank || unit.guildRank || "D", "gold"),
        buildDetailKeyValue("영입 비용", `${tavernCandidate.hireCost || 0}G`, "gold"),
        buildDetailKeyValue("고유 패시브", `${signaturePassives.length}개`, signaturePassives.length ? "gold" : "muted"),
        "</div>",
        tavernCandidate.startingWeapon
          ? `<p>시작 장비: ${tavernCandidate.startingWeapon.name} / ${InventoryService.describeItem(tavernCandidate.startingWeapon)}</p>`
          : "<p>시작 장비 정보가 없습니다.</p>",
        `<p>${tavernCandidate.recruitedAt ? "이미 영입된 후보입니다." : "주점에서 바로 영입 가능한 대기 후보입니다."}</p>`
      ].join("")
      : [
        '<div class="detail-metric-grid">',
        buildDetailKeyValue("잠재력", potentialMeta.label, "violet"),
        buildDetailKeyValue("훈련 단계", `${unit.trainingLevel || 0}/${StatsService.getTrainingCap(unit)}`, canTrain ? "cyan" : "muted"),
        buildDetailKeyValue("길드 승급", guildPromotion ? `${guildPromotion.nextRank} ${guildPromotion.eligible ? "가능" : "대기"}` : "최고 등급", guildPromotion && guildPromotion.eligible ? "gold" : "muted"),
        buildDetailKeyValue("고유 패시브", `${signaturePassives.length}개`, signaturePassives.length ? "gold" : "muted"),
        "</div>",
        guildPromotion
          ? `<p>다음 등급 승급: Lv.${guildPromotion.minLevel} / 훈련 ${guildPromotion.minTrainingLevel} / ${guildPromotion.cost}G</p>`
          : "<p>길드 최고 등급에 도달했습니다.</p>",
        `<p>${canTrain ? `다음 훈련 비용 ${trainingCost}G` : "현재 잠재력 기준 훈련 한계에 도달했습니다."}</p>`
      ].join("");
    const equipmentSectionMarkup = isReadOnly && tavernCandidate
      ? [
        buildEquipmentLoadoutMarkup(unit.id, { loadout: tavernPreviewLoadout || {} }),
        `  <p>${tavernCandidate.startingWeapon ? InventoryService.describeItem(tavernCandidate.startingWeapon) : "주점 후보는 아직 파티 장비를 장착하지 않은 상태입니다."}</p>`
      ].join("")
      : [
        buildEquipmentLoadoutMarkup(unit.id),
        pendingSkillSummaries ? `  <p>확정 대기 스킬</p>` : "",
        pendingSkillSummaries ? `  <div class="detail-stats">${pendingSkillSummaries}</div>` : ""
      ].filter(Boolean).join("");

    return [
      `<div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
      '  <div class="inventory-meta">',
      topMetaMarkup,
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
      buildItemFeatureSection(
        "성장 정보",
        growthSectionMarkup,
        "is-summary",
        isReadOnly ? "" : buildGrowthInfoHelpMarkup(unit)
      ),
      buildItemFeatureSection("병종 운용", [
        buildClassProfileMarkup(classProfile)
      ].join(""), "is-stats"),
      buildItemFeatureSection("액티브 / 패시브 스킬", [
        `<p>전직: ${promotionSummary}</p>`,
        '  <div class="detail-skill-split">',
        `    <section class="detail-mini-pane"><div class="detail-feature-title">고유 패시브</div>${signaturePassives.length
          ? `<div class="detail-token-list compact-skill-token-list">${signaturePassives.map((skill) => `<span class="detail-token is-unique compact-skill-token"><strong>${skill.name}</strong><small>${skill.description}</small></span>`).join("")}</div>`
          : '<div class="detail-token-list"><span class="detail-token is-muted">고유 패시브 없음</span></div>'}</section>`,
        `    <section class="detail-mini-pane"><div class="detail-feature-title">습득 패시브</div>${learnedSkills.length
          ? `  <div class="detail-stats compact-badge-list">${learnedSkills.map((skill) => buildKnownSkillBadge(skill, false)).join("")}</div>`
          : '  <div class="detail-stats"><span class="meta-pill is-muted">습득 패시브 없음</span></div>'}</section>`,
        "  </div>",
        `<p>장착 액티브</p>`,
        `  <div class="detail-stats compact-badge-list">${equippedActiveSkills.map((skill, index) => (
          skill
            ? buildKnownSkillBadge(skill, true, { isEquipped: true, slotLabel: getSkillSlotLabel(index) })
            : `<span class="meta-pill is-muted">${getSkillSlotLabel(index)} 비어 있음</span>`
        )).join("")}</div>`
      ].filter(Boolean).join(""), "is-affix"),
      buildItemFeatureSection("장비", equipmentSectionMarkup, "is-set"),
      !isReadOnly ? '  <div class="detail-footer-split">' : "",
      !isReadOnly ? '    <div class="progression-stat-section">' : "",
      !isReadOnly ? buildProgressionStatButtonsMarkup(unit, previewPrimaryStats, remainingStatPoints) : "",
      !isReadOnly ? '      <div class="detail-actions progression-stat-actions">' : "",
      !isReadOnly ? `        <span class="meta-pill ${remainingStatPoints > 0 ? "is-gold" : "is-muted"}">남은 스탯 ${remainingStatPoints}</span>` : "",
      !isReadOnly ? `        <button class="primary-button small-button ${(spentStats || spentSkills) ? "" : "is-placeholder-action"}" type="button" data-progression-confirm="true" ${(spentStats || spentSkills) ? "" : "disabled aria-hidden=\"true\" tabindex=\"-1\""}>확정</button>` : "",
      !isReadOnly ? `        <button class="ghost-button small-button ${(spentStats || spentSkills) ? "" : "is-placeholder-action"}" type="button" data-progression-cancel="true" ${(spentStats || spentSkills) ? "" : "disabled aria-hidden=\"true\" tabindex=\"-1\""}>되돌리기</button>` : "",
      !isReadOnly ? "      </div>" : "",
      !isReadOnly ? "    </div>" : "",
      !isReadOnly ? '    <div class="detail-actions">' : "",
      !isReadOnly ? `      <button class="primary-button small-button" type="button" data-train-unit="true" ${canTrain ? "" : "disabled"}>${canTrain ? `훈련 ${trainingCost}G` : "훈련 한계"}</button>` : "",
      !isReadOnly ? `      <button class="secondary-button small-button" type="button" data-promote-rank="true" ${guildPromotion && guildPromotion.eligible ? "" : "disabled"}>${guildPromotion ? `${guildPromotion.nextRank} 승급` : "최고 등급"}</button>` : "",
      !isReadOnly ? '      <button class="primary-button small-button" type="button" data-open-equipment="true">장착 관리</button>' : "",
      !isReadOnly ? '      <button class="primary-button small-button" type="button" data-open-skill-modal="true">스킬 관리</button>' : "",
      !isReadOnly ? `      <button class="secondary-button small-button" type="button" data-set-leader="true" ${appState.saveData.leaderUnitId === unit.id ? "disabled" : ""}>리더 지정</button>` : "",
      !isReadOnly ? '      <button class="secondary-button small-button" type="button" data-unequip-all="true">전체 해제</button>' : "",
      !isReadOnly ? `      <button class="secondary-button small-button" type="button" data-toggle-sortie="true">${isUnitSelectedForSortie(unit.id) ? "후방 대기" : "출전 등록"}</button>` : "",
      !isReadOnly ? `      ${dismissButtonMarkup}` : "",
      !isReadOnly ? promotionOptions.map((promotion) => (
        `<button class="secondary-button small-button" type="button" data-promote-class="${promotion.className}">${promotion.className} 전직</button>`
      )).join("") : "",
      !isReadOnly ? "    </div>" : "",
      !isReadOnly ? "  </div>" : ""
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

    const saveData = appState.saveData;
    const campaign = saveData.campaign || {};
    const tavern = saveData.tavern || {};
    const selectedStage = BattleService.getStageCatalog(saveData).find((stage) => stage.selected);
    const visibleStages = BattleService.getStageCatalog(saveData).filter((stage) => !stage.hidden);
    const availableStages = visibleStages.filter((stage) => stage.available);
    const endlessRun = BattleService.getEndlessRunSummary(saveData);
    const endlessCurrentRun = BattleService.getEndlessCurrentRunSummary(saveData);
    const rewardCodex = BattleService.getRewardCodex(saveData);
    const leaderUnit = getLeaderUnit(saveData);
    const roster = saveData.roster || [];
    const inventory = saveData.inventory || [];
    const selectedPartyUnits = (saveData.selectedPartyIds || [])
      .map((unitId) => roster.find((unit) => unit.id === unitId))
      .filter(Boolean);
    const partyCount = selectedPartyUnits.length;
    const equipmentInventory = inventory.filter((item) => InventoryService.isEquipment(item));
    const equippedCount = equipmentInventory.filter((item) => !!item.equippedBy).length;
    const equipRate = equipmentInventory.length ? Math.round((equippedCount / equipmentInventory.length) * 100) : 0;
    const clearedCount = (campaign.clearedStageIds || []).length;
    const discoveredRewardCount = rewardCodex.filter((reward) => reward.discovered).length;
    const lastResult = campaign.lastResult
      ? `${campaign.lastResult.stageName} / ${campaign.lastResult.result === "victory" ? "승리" : "패배"}`
      : "없음";
    const lastSavedAt = saveData.lastSavedAt
      ? new Date(saveData.lastSavedAt).toLocaleString("ko-KR")
      : "기록 없음";
    const averageLevel = roster.length
      ? (roster.reduce((sum, unit) => sum + Number(unit.level || 1), 0) / roster.length).toFixed(1)
      : "0.0";
    const highestPotentialUnit = roster.slice().sort((left, right) => (
      Number(right.potentialScore || 0) - Number(left.potentialScore || 0)
    ))[0] || null;
    const trainingLeadUnit = roster.slice().sort((left, right) => {
      const trainingDiff = Number(right.trainingLevel || 0) - Number(left.trainingLevel || 0);

      if (trainingDiff !== 0) {
        return trainingDiff;
      }

      return Number(right.level || 1) - Number(left.level || 1);
    })[0] || null;
    const tavernLineup = (tavern.lineup || []).filter((candidate) => !candidate.recruitedAt);
    const bestCandidate = tavernLineup.slice().sort((left, right) => {
      const leftScore = Number(left.potentialScore || (left.unit && left.unit.potentialScore) || 0);
      const rightScore = Number(right.potentialScore || (right.unit && right.unit.potentialScore) || 0);
      return rightScore - leftScore;
    })[0] || null;
    const bestCandidateScore = bestCandidate
      ? Number(bestCandidate.potentialScore || (bestCandidate.unit && bestCandidate.unit.potentialScore) || 36)
      : 0;
    const bestCandidatePotentialLabel = bestCandidate
      ? StatsService.getPotentialMeta({ potentialScore: bestCandidateScore }).label
      : "없음";
    const headlineCopy = saveData.stageStatus === "in_progress"
      ? `${selectedStage ? selectedStage.name : saveData.stageId}에서 전투가 진행 중입니다. ${leaderUnit ? `${leaderUnit.name}이(가) 선두에서 전열을 유지하고 있습니다.` : "현재 파티가 교전 상태를 유지하고 있습니다."}`
      : `${selectedStage ? selectedStage.name : saveData.stageId} 출격을 준비 중입니다. ${leaderUnit ? `${leaderUnit.name}을(를) 중심으로 다음 공략 루트를 정비하고 있습니다.` : "현재 파티 편성이 비어 있습니다."}`;
    const supportCopy = `전체 평균 레벨 ${averageLevel}, 장비 착용률 ${equipRate}%입니다. 최근 전투 결과는 ${lastResult}이며, 마지막 저장 시각은 ${lastSavedAt}입니다.`;
    const currentRunLabel = endlessCurrentRun
      ? `${endlessCurrentRun.floorsCleared}층 돌파 / 정예 ${endlessCurrentRun.eliteDefeated} / 피해 ${endlessCurrentRun.damageDealt}`
      : "현재 진행 중인 균열 런 없음";

    return [
      `<div class="item-title-row"><strong class="card-title">${appState.currentUserId}</strong><span class="card-subtitle">마이페이지</span></div>`,
      '  <div class="detail-metric-grid compact-profile-grid">',
      buildDetailKeyValue("현 지휘관", leaderUnit ? `${leaderUnit.name} / ${leaderUnit.className}` : "없음", "gold"),
      buildDetailKeyValue("작전 축", selectedStage ? selectedStage.name : saveData.stageId, "cyan"),
      buildDetailKeyValue("전력 평균", `Lv.${averageLevel}`, "violet"),
      buildDetailKeyValue("보유 골드", `${saveData.partyGold || 0}G`, "gold"),
      "</div>",
      buildItemFeatureSection("지휘 브리핑", [
        `<p class="detail-summary-copy">${headlineCopy}</p>`,
        `<p class="detail-summary-copy">${supportCopy}</p>`,
        '<div class="detail-token-list">',
        `  <span class="detail-token is-stat">출전 편성 ${partyCount}/${MAX_SORTIE_SIZE}</span>`,
        `  <span class="detail-token is-stat">가용 스테이지 ${availableStages.length}/${visibleStages.length}</span>`,
        `  <span class="detail-token is-stat">보스 도감 ${discoveredRewardCount}/${rewardCodex.length}</span>`,
        `  <span class="detail-token is-stat">최근 저장 ${lastSavedAt}</span>`,
        '</div>'
      ].join(""), "is-summary"),
      buildItemFeatureSection("전력 스냅샷", [
        '<div class="detail-metric-grid compact-profile-grid">',
        buildDetailKeyValue("소속 인원", `${roster.length}명 / 출전 ${partyCount}명`, "gold"),
        buildDetailKeyValue("장비 가동률", `${equippedCount}/${equipmentInventory.length || 0}개`, "cyan"),
        buildDetailKeyValue("최고 잠재", highestPotentialUnit ? `${highestPotentialUnit.name} / ${StatsService.getPotentialMeta(highestPotentialUnit).label}` : "없음", "violet"),
        buildDetailKeyValue("훈련 선두", trainingLeadUnit ? `${trainingLeadUnit.name} / ${trainingLeadUnit.trainingLevel || 0}단계` : "없음", "gold"),
        '</div>',
        '<div class="detail-token-list">',
        (selectedPartyUnits.length
          ? selectedPartyUnits.map((unit, index) => `  <span class="detail-token is-stat">${index + 1}번 편성 ${unit.name} / ${unit.className}</span>`).join("")
          : '  <span class="detail-token is-stat">현재 출전 편성 비어 있음</span>'),
        '</div>'
      ].join(""), "is-stats"),
      buildItemFeatureSection("탐사 기록", [
        '<div class="detail-metric-grid compact-profile-grid">',
        buildDetailKeyValue("전역 클리어", `${clearedCount}개`, clearedCount ? "gold" : "muted"),
        buildDetailKeyValue("보상 식별", `${discoveredRewardCount}/${rewardCodex.length}`, discoveredRewardCount ? "cyan" : "muted"),
        buildDetailKeyValue("균열 최고", `${saveData.endless && saveData.endless.bestFloor ? saveData.endless.bestFloor : 1}층`, "violet"),
        buildDetailKeyValue("현재 런", endlessCurrentRun ? `${endlessCurrentRun.highestFloor || 1}층 도달` : "대기 중", "gold"),
        '</div>',
        `<p class="detail-summary-copy">${endlessRun ? `최근 균열에서는 ${endlessRun.floor}층까지 진입했고 결과는 ${endlessRun.result === "defeat" ? "패배" : "돌파"}였습니다.` : "아직 기록된 균열 원정이 없습니다. 다음 런에서 첫 브리핑 로그가 쌓입니다."}</p>`,
        '<div class="detail-token-list">',
        `  <span class="detail-token is-stat">최근 전투 ${lastResult}</span>`,
        `  <span class="detail-token is-stat">현재 균열 ${currentRunLabel}</span>`,
        (endlessRun && endlessRun.relicNames && endlessRun.relicNames.length
          ? endlessRun.relicNames.slice(0, 3).map((name) => `  <span class="detail-token is-stat">최근 확보 유물 ${name}</span>`).join("")
          : '  <span class="detail-token is-stat">최근 확보 유물 없음</span>'),
        '</div>'
      ].join(""), "is-affix"),
      buildItemFeatureSection("주점 레이더", [
        '<div class="detail-metric-grid compact-profile-grid">',
        buildDetailKeyValue("대기 명단", `${tavernLineup.length}명`, tavernLineup.length ? "gold" : "muted"),
        buildDetailKeyValue("최상위 후보", bestCandidate ? `${bestCandidate.unit.name} / ${bestCandidate.unit.className}` : "대기 없음", "cyan"),
        buildDetailKeyValue("후보 잠재", bestCandidate ? bestCandidatePotentialLabel : "없음", "violet"),
        buildDetailKeyValue("리더 등급", leaderUnit ? formatRankBadge(leaderUnit.guildRank || "D") : "없음", "gold"),
        '</div>',
        `<p class="detail-summary-copy">${tavernLineup.length
          ? `현재 주점에는 ${tavernLineup.length}명의 지원자가 대기 중입니다. 가장 눈에 띄는 후보는 ${bestCandidate.unit.name}이며, 잠재력 평가는 ${bestCandidatePotentialLabel}입니다.`
          : "현재 주점 대기 명단이 비어 있습니다. 시간이 지나거나 새로고침 후 새로운 지원자를 확인할 수 있습니다."}</p>`,
        '<div class="detail-token-list">',
        (tavernLineup.length
          ? tavernLineup.slice(0, 3).map((candidate) => {
            const candidateScore = Number(candidate.potentialScore || (candidate.unit && candidate.unit.potentialScore) || 36);
            const potentialLabel = StatsService.getPotentialMeta({ potentialScore: candidateScore }).label;
            return `  <span class="detail-token is-stat">${candidate.unit.name} / ${candidate.unit.className} / ${potentialLabel} / ${candidate.hireCost || 0}G</span>`;
          }).join("")
          : '  <span class="detail-token is-stat">새 명단 대기 중</span>'),
        '</div>'
      ].join(""), "is-set")
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
            label: item.equippedBy ? "이미 장착 중" : "장착 대상 선택",
            className: "secondary-button",
            disabled: !isEquipmentItem || !!item.equippedBy,
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
              showToast(formatConsumableUseMessage(selectedUnit, result));
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

    if (type === "equip-confirm") {
      const pendingAction = appState.pendingEquipAction;
      const item = pendingAction ? InventoryService.getItemById(appState.saveData, pendingAction.itemId) : null;
      const unit = pendingAction && appState.saveData
        ? (appState.saveData.roster || []).find((entry) => entry.id === pendingAction.unitId)
        : null;
      const replacedItem = pendingAction ? InventoryService.getItemById(appState.saveData, pendingAction.replacedItemId) : null;

      if (!pendingAction || !item || !unit || !replacedItem) {
        return null;
      }

      return {
        title: "장착 교체 확인",
        bodyMarkup: [
          `<div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${InventoryService.getSlotLabel(pendingAction.slotKey)}</span></div>`,
          '  <div class="inventory-meta">',
          `    <span class="meta-pill is-gold">새 장비 ${item.name}</span>`,
          `    <span class="meta-pill is-muted">현재 장비 ${replacedItem.name}</span>`,
          "  </div>",
          "  <p>장착중인 아이템이 있습니다. 교체하시겠습니까?</p>"
        ].join(""),
        actions: [
          {
            id: "confirm-equip-replace",
            label: "교체 장착",
            className: "primary-button",
            disabled: false,
            onClick() {
              const equippedItem = InventoryService.equipItemToUnit(
                appState.saveData,
                pendingAction.unitId,
                pendingAction.itemId,
                pendingAction.slotKey
              );
              appState.selectedMenuUnitId = pendingAction.unitId;
              persistSession(appState.saveData, appState.settings);
              openEquipmentModal(unit.id, { initialItemId: equippedItem.id });
              showToast(`${unit.name}이(가) ${equippedItem.name} 장착`);
            }
          },
          {
            id: "cancel-equip-replace",
            label: "취소",
            className: "ghost-button",
            disabled: false,
            onClick() {
              openDetailModal("equip-target", pendingAction.itemId);
            }
          }
        ]
      };
    }

    if (type === "sortie") {
      return {
        title: "출전 파티 관리",
        bodyMarkup: buildSortieManagementMarkup(),
        actions: []
      };
    }

    if (type === "shop") {
      const product = InventoryService.SHOP_CATALOG.find((entry) => entry.id === id);
      const shopLineupIds = appState.saveData && appState.saveData.shop && Array.isArray(appState.saveData.shop.lineupIds)
        ? appState.saveData.shop.lineupIds
        : [];

      if (!product || !InventoryService.isAvailableInShop(product) || !shopLineupIds.includes(product.id)) {
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
        title: "캐릭터 상세",
        bodyMarkup: buildUnitFullDetailMarkup(candidate.unit, {
          readOnly: true,
          candidate
        }),
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

    if (appState.detailModal.type === "unit" || appState.detailModal.type === "equip-target" || appState.detailModal.type === "sortie") {
      const detailCard = host.querySelector(".menu-detail-card");

      if (detailCard) {
        detailCard.addEventListener("click", (event) => {
          if (appState.detailModal.type === "unit") {
            handleUnitDetailModalInteraction(event, String(appState.detailModal.id));
            return;
          }

          if (appState.detailModal.type === "equip-target") {
            handleEquipTargetModalInteraction(event, String(appState.detailModal.id));
            return;
          }

          handleSortieManagementModalInteraction(event);
        });

        if (appState.detailModal.type === "sortie") {
          bindSortieManagementDragAndDrop(detailCard);
        }
      }
    }
  }

  function openDetailModal(type, id) {
    closeEquipmentModal();
    closeSkillModal();
    appState.detailModal.type = type;
    appState.detailModal.id = id;
    appState.detailModal.page = 1;
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

    if (button.dataset.trainUnit === "true") {
      try {
        const result = TavernService.trainUnit(appState.saveData, unit.id);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(`${result.unit.name} 훈련 완료 / ${StatsService.describeLevelGains(result.gains)}`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.promoteRank === "true") {
      try {
        const result = TavernService.promoteGuildRank(appState.saveData, unit.id);
        persistSession(appState.saveData, appState.settings);
        refreshUnitDetailModal(unit.id);
        showToast(`${result.unit.name} 길드 등급 승급: ${result.previousRank} -> ${result.nextRank}`);
      } catch (error) {
        showToast(error.message, true);
      }
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
      return;
    }

    if (button.dataset.dismissUnit === "true") {
      if (!global.confirm(`${unit.name}을(를) 파티에서 방출하시겠습니까? 장착 중인 장비는 모두 해제됩니다.`)) {
        return;
      }

      try {
        const result = TavernService.dismissUnit(appState.saveData, unit.id);
        clearProgressionDraft(unit.id);
        appState.cachedUnitDetailUnitId = null;
        appState.cachedUnitDetailMarkup = "";
        appState.selectedMenuUnitId = result.leaderUnit ? result.leaderUnit.id : null;
        persistSession(appState.saveData, appState.settings);
        renderMainMenu();
        closeDetailModal();
        showToast(`${result.unit.name}을(를) 파티에서 방출했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  function handleEquipTargetModalInteraction(event, itemId) {
    const button = event.target.closest("button");
    const item = InventoryService.getItemById(appState.saveData, itemId);

    if (!button || !item || !InventoryService.isEquipment(item)) {
      return;
    }

    if (button.dataset.equipTargetPage) {
      const roster = sortPartyRoster((appState.saveData && appState.saveData.roster) || [], getSelectedPartyIds());
      const totalPages = Math.max(1, Math.ceil(roster.length / EQUIP_TARGET_MODAL_PAGE_SIZE));
      appState.detailModal.page = button.dataset.equipTargetPage === "next"
        ? Math.min(totalPages, Number(appState.detailModal.page || 1) + 1)
        : Math.max(1, Number(appState.detailModal.page || 1) - 1);
      renderDetailModal();
      return;
    }

    if (!button.matches("[data-equip-target-unit], [data-equip-now-unit]")) {
      return;
    }

    const unitId = String(button.dataset.equipTargetUnit || button.dataset.equipNowUnit || "");
    const unit = (appState.saveData && appState.saveData.roster || []).find((entry) => entry.id === unitId);

    if (!unit) {
      showToast("장착 대상을 찾을 수 없습니다.", true);
      return;
    }

    if (!InventoryService.canEquip(appState.saveData, unit, item)) {
      showToast(`${unit.className}은 ${InventoryService.getTypeLabel(item.type || item.slot)}을(를) 장착할 수 없습니다.`, true);
      return;
    }

    appState.selectedMenuUnitId = unit.id;

    if (button.dataset.equipTargetUnit) {
      closeDetailModal();
      openEquipmentModal(unit.id, { initialItemId: item.id });
      return;
    }

    const equipAction = resolveEquipAction(unit, item);

    if (!equipAction.targetSlotKey) {
      showToast(`${unit.className}은 ${InventoryService.getTypeLabel(item.type || item.slot)}을(를) 장착할 수 없습니다.`, true);
      return;
    }

    if (equipAction.replacedItem) {
      appState.pendingEquipAction = {
        itemId: item.id,
        unitId: unit.id,
        slotKey: equipAction.targetSlotKey,
        replacedItemId: equipAction.replacedItem.id
      };
      openDetailModal("equip-confirm", item.id);
      return;
    }

    try {
      const equippedItem = InventoryService.equipItemToUnit(appState.saveData, unit.id, item.id, equipAction.targetSlotKey);
      persistSession(appState.saveData, appState.settings);
      openEquipmentModal(unit.id, { initialItemId: equippedItem.id });
      showToast(`${unit.name}이(가) ${equippedItem.name} 장착`);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function handleSortieManagementModalInteraction(event) {
    const button = event.target.closest("button");

    if (!button || !appState.saveData) {
      return;
    }

    if (button.dataset.sortieFocus) {
      const unitId = String(button.dataset.sortieFocus);
      appState.selectedMenuUnitId = unitId;
      renderMainMenu();
      openDetailModal("unit", unitId);
      return;
    }

    if (button.dataset.sortieLeader) {
      try {
        const unitId = String(button.dataset.sortieLeader);
        const unit = (appState.saveData.roster || []).find((entry) => entry.id === unitId);

        if (!unit) {
          showToast("리더로 지정할 모험가를 찾을 수 없습니다.", true);
          return;
        }

        TavernService.setLeader(appState.saveData, unitId);
        persistSession(appState.saveData, appState.settings);
        renderMainMenu();
        openDetailModal("sortie", "party");
        showToast(`${unit.name}을(를) 파티 리더로 지정했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.sortieSwap) {
      const slotIndex = Number(button.dataset.sortieSwap || 0);
      appState.quickSwapSlotIndex = appState.quickSwapSlotIndex === slotIndex ? null : slotIndex;
      renderMainMenu();
      renderDetailModal();
      return;
    }

    if (button.dataset.sortieRemove) {
      try {
        const roster = appState.saveData.roster || [];
        const slotIndex = Number(button.dataset.sortieRemove || 0);
        const removedUnitId = removeSortieSlot(slotIndex);
        const removedUnit = removedUnitId ? roster.find((entry) => entry.id === removedUnitId) : null;
        persistSession(appState.saveData, appState.settings);
        openDetailModal("sortie", "party");
        showToast(removedUnit ? `${removedUnit.name}을(를) 출전 파티에서 제외했습니다.` : "슬롯에서 캐릭터를 제외했습니다.");
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.sortieAssign) {
      try {
        const unitId = String(button.dataset.sortieAssign);

        if (appState.quickSwapSlotIndex === null) {
          showToast("먼저 바꿀 슬롯을 선택하세요.", true);
          return;
        }

        const slotLabel = `${appState.quickSwapSlotIndex + 1}번 슬롯`;
        const unit = assignUnitToSortieSlot(unitId, appState.quickSwapSlotIndex);
        appState.selectedMenuUnitId = unit.id;
        appState.quickSwapSlotIndex = null;
        persistSession(appState.saveData, appState.settings);
        openDetailModal("sortie", "party");
        showToast(`${unit.name}을(를) ${slotLabel}에 배치했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (button.dataset.sortiePage) {
      const roster = (appState.saveData && appState.saveData.roster) || [];
      const totalPages = Math.max(1, Math.ceil(roster.length / SORTIE_MANAGER_PAGE_SIZE));
      appState.sortieManagerView.page = button.dataset.sortiePage === "next"
        ? Math.min(totalPages, Number(appState.sortieManagerView.page || 1) + 1)
        : Math.max(1, Number(appState.sortieManagerView.page || 1) - 1);
      renderDetailModal();
    }
  }

  function bindSortieManagementDragAndDrop(root) {
    if (!root || !appState.saveData) {
      return;
    }

    root.querySelectorAll("[data-sortie-drag-unit]").forEach((card) => {
      card.addEventListener("dragstart", (event) => {
        const unitId = String(card.dataset.sortieDragUnit || "");

        if (!unitId) {
          return;
        }

        appState.sortieManagerView.dragUnitId = unitId;
        card.classList.add("is-dragging");

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", unitId);
        }
      });

      card.addEventListener("dragend", () => {
        appState.sortieManagerView.dragUnitId = null;
        card.classList.remove("is-dragging");
        root.querySelectorAll("[data-sortie-slot]").forEach((slotCard) => {
          slotCard.classList.remove("is-drop-target");
        });
      });
    });

    root.querySelectorAll("[data-sortie-slot]").forEach((slotCard) => {
      slotCard.addEventListener("dragover", (event) => {
        const draggedUnitId = appState.sortieManagerView.dragUnitId
          || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");

        if (!draggedUnitId) {
          return;
        }

        event.preventDefault();
        slotCard.classList.add("is-drop-target");

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      });

      slotCard.addEventListener("dragleave", () => {
        slotCard.classList.remove("is-drop-target");
      });

      slotCard.addEventListener("drop", (event) => {
        const draggedUnitId = appState.sortieManagerView.dragUnitId
          || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");
        const slotIndex = Number(slotCard.dataset.sortieSlot || -1);

        slotCard.classList.remove("is-drop-target");

        if (!draggedUnitId || slotIndex < 0) {
          return;
        }

        event.preventDefault();

        try {
          const unit = assignUnitToSortieSlot(draggedUnitId, slotIndex);
          appState.selectedMenuUnitId = unit.id;
          appState.quickSwapSlotIndex = null;
          appState.sortieManagerView.dragUnitId = null;
          persistSession(appState.saveData, appState.settings);
          renderMainMenu();
          openDetailModal("sortie", "party");
          showToast(`${unit.name}을(를) ${slotIndex + 1}번 슬롯에 배치했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function buildEquipmentDetailMarkup(unit, item, slotKey) {
    if (!unit) {
      return "<p>장비 정보를 표시할 수 없습니다.</p>";
    }

    if (item) {
      return buildCompactEquipmentItemDetailMarkup(item);
    }

    if (slotKey) {
      const loadout = InventoryService.getEquipmentLoadout(appState.saveData, unit.id);
      const slotMeta = InventoryService.getEquipSlotMeta(slotKey);
      const equippedItem = loadout[slotKey];
      return [
        `<div class="item-title-row"><strong class="card-title">${slotMeta ? slotMeta.label : slotKey}</strong><span class="card-subtitle">${equippedItem ? "장착됨" : "빈 슬롯"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${equippedItem ? "is-cyan" : "is-muted"}">${equippedItem ? "장착 완료" : "비어 있음"}</span>`,
        `    <span class="meta-pill">${slotMeta && slotMeta.accepts ? slotMeta.accepts.map((entry) => InventoryService.getSlotLabel(entry)).join(" / ") : "장비 슬롯"}</span>`,
        "  </div>",
        equippedItem
          ? `<p>${equippedItem.name}이(가) 장착되어 있습니다. 슬롯 카드나 오른쪽 목록을 클릭하면 동일한 장비 상세 형식으로 확인할 수 있습니다.</p>`
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

  function buildEquipmentInventoryCardSummary(item) {
    if (!item) {
      return "";
    }

    if (InventoryService.isWeapon(item)) {
      return `위력 ${item.might || 0} / 명중 ${item.hit || 0} / 사거리 ${item.rangeMin}-${item.rangeMax} / 내구 ${item.uses || 0}`;
    }

    const statSummary = InventoryService.formatStatBonusLine(item);
    return statSummary !== "추가 능력치 없음"
      ? statSummary
      : `${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)} 장비`;
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

    hideFloatingStatTooltip();

    const loadout = InventoryService.getEquipmentLoadout(appState.saveData, unit.id);
    const selectedSlotKey = appState.equipmentModal.hoveredSlotKey || null;
    const selectedSlotMeta = selectedSlotKey ? InventoryService.getEquipSlotMeta(selectedSlotKey) : null;
    const items = (appState.saveData.inventory || []).filter((item) => {
      if (!InventoryService.isEquipment(item) || !InventoryService.canEquip(appState.saveData, unit, item)) {
        return false;
      }

      if (selectedSlotKey) {
        return InventoryService.canEquipIntoSlot(appState.saveData, unit, item, selectedSlotKey);
      }

      return true;
    }).sort((left, right) => {
      if (!!left.equippedBy !== !!right.equippedBy) {
        return left.equippedBy ? 1 : -1;
      }

      const rarityGap = InventoryService.RARITY_ORDER.indexOf(right.rarity) - InventoryService.RARITY_ORDER.indexOf(left.rarity);

      if (rarityGap !== 0) {
        return rarityGap;
      }

      return String(left.name).localeCompare(String(right.name), "ko");
    });
    const totalPages = Math.max(1, Math.ceil(items.length / EQUIPMENT_MODAL_PAGE_SIZE));
    let currentPage = Math.max(1, Math.min(totalPages, Number(appState.equipmentModal.page || 1)));

    if (appState.equipmentModal.hoveredItemId) {
      const hoveredIndex = items.findIndex((item) => item.id === appState.equipmentModal.hoveredItemId);

      if (hoveredIndex >= 0) {
        currentPage = Math.floor(hoveredIndex / EQUIPMENT_MODAL_PAGE_SIZE) + 1;
      }
    }

    appState.equipmentModal.page = currentPage;
    const pageStart = (currentPage - 1) * EQUIPMENT_MODAL_PAGE_SIZE;
    const visibleItems = items.slice(pageStart, pageStart + EQUIPMENT_MODAL_PAGE_SIZE);

    host.innerHTML = [
      '<div class="modal-backdrop menu-modal-backdrop">',
      '  <div class="modal-panel modal-panel-wide equipment-modal-panel">',
      '    <button id="menu-modal-close-button" class="ghost-button modal-close-button" type="button">닫기</button>',
      '    <div class="modal-body equipment-modal-body">',
      `      <div class="item-title-row equipment-modal-header"><strong class="card-title">${unit.name} 장착 관리</strong><span class="card-subtitle">${unit.className}</span><button class="secondary-button small-button equipment-summary-button" type="button" data-show-equipment-summary="true">${unit.name} 장비 상세</button></div>`,
      '      <div class="equipment-modal-layout">',
      '        <section class="equipment-slot-column">',
      '          <h3>장비 슬롯</h3>',
      '          <div class="equipment-slot-grid">',
      InventoryService.getEquipSlotLayout().map((slotMeta) => {
        const item = loadout[slotMeta.key];
        const rarity = item ? InventoryService.getRarityMeta(item.rarity) : null;
        const isSelected = selectedSlotKey === slotMeta.key;

        return [
          `<article class="inventory-card equipment-slot-card ${isSelected ? "is-selected " : ""}${item ? `rarity-${item.rarity}` : "is-empty"}" data-equip-slot="${slotMeta.key}" data-slot-item-id="${item ? item.id : ""}" tabindex="0" ${item ? `data-tooltip-html="${escapeAttribute(buildEquipmentSlotTooltipMarkup(item, slotMeta))}"` : ""}>`,
          `  <div class="item-title-row"><strong class="card-title">${slotMeta.label}</strong><span class="card-subtitle">${item ? rarity.label : "EMPTY"}</span></div>`,
          `  <p>${item ? item.name : "장비 없음"}</p>`,
          item
            ? '  <p class="equipment-slot-hint">마우스를 올리면 능력치와 옵션을 확인할 수 있습니다.</p>'
            : `  <p class="equipment-slot-hint is-muted">${slotMeta.accepts.map((entry) => InventoryService.getSlotLabel(entry)).join(" / ")}</p>`,
          item ? `  <button class="ghost-button small-button equipment-unequip-button" type="button" data-unequip-item="${item.id}">해제</button>` : "",
          "</article>"
        ].join("");
      }).join(""),
      "          </div>",
      "        </section>",
      '        <section class="equipment-inventory-column">',
      '          <div class="item-title-row">',
      '            <h3>보유 장비</h3>',
      `            <span class="meta-pill ${selectedSlotMeta ? "is-cyan" : "is-gold"}">${selectedSlotMeta ? `${selectedSlotMeta.label} 슬롯 전용` : "전체 장착 가능 장비"}</span>`,
      `            <span class="meta-pill is-gold">${currentPage} / ${totalPages} 페이지 · 더블클릭 또는 드래그</span>`,
      "          </div>",
      items.length
        ? `          <div class="equipment-inventory-list">${visibleItems.map((item) => {
            const rarity = InventoryService.getRarityMeta(item.rarity);
            const ownerText = item.equippedBy ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}` : "미장착";
            const equipLabel = item.equippedBy === unit.id ? "재장착" : item.equippedBy ? "교체 장착" : "장착";
            const equippedStateClass = item.equippedBy
              ? item.equippedBy === unit.id
                ? "is-equipped-self"
                : "is-equipped-other"
              : "";
            const equippedStateText = item.equippedBy
              ? item.equippedBy === unit.id
                ? "현재 장착중"
                : "다른 유닛 장착중"
              : "";

            return [
              `<article class="inventory-card equipment-item-card rarity-${item.rarity} ${equippedStateClass}" draggable="true" data-modal-item="${item.id}">`,
              `  <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
              '  <div class="inventory-meta">',
              `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
              equippedStateText ? `    <span class="meta-pill is-crimson equipment-state-pill">${equippedStateText}</span>` : "",
              `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
              "  </div>",
              `  <p class="equipment-item-summary">${buildEquipmentInventoryCardSummary(item)}</p>`,
              '  <div class="button-row">',
              `    <button class="secondary-button small-button" type="button" data-modal-equip="${item.id}">${equipLabel}</button>`,
              item.equippedBy ? `    <button class="ghost-button small-button" type="button" data-modal-unequip="${item.id}">해제</button>` : "",
              "  </div>",
              "</article>"
            ].join("");
      }).join("")}</div>
          <div class="list-pagination">
            <button class="ghost-button small-button" type="button" data-equipment-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>
            <span class="pagination-label">${currentPage} / ${totalPages}</span>
            <button class="ghost-button small-button" type="button" data-equipment-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>
          </div>`
        : `          <div class="inventory-card"><p>${selectedSlotMeta ? `${selectedSlotMeta.label} 슬롯에 장착 가능한 장비가 인벤토리에 없습니다.` : "이 유닛이 장착 가능한 장비가 인벤토리에 없습니다."}</p></div>`,
      "        </section>",
      "      </div>",
      '      <section id="menu-equipment-detail" class="modal-card equipment-detail-panel"></section>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    const backdrop = host.querySelector(".menu-modal-backdrop");
    getElement("menu-modal-close-button").addEventListener("click", closeEquipmentModal);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeEquipmentModal();
      }
    });

    host.querySelectorAll("[data-equip-slot]").forEach((slotCard) => {
      const slotKey = slotCard.dataset.equipSlot;
      const slotItemId = slotCard.dataset.slotItemId || null;

      slotCard.addEventListener("click", () => {
        appState.equipmentModal.hoveredItemId = slotItemId;
        appState.equipmentModal.hoveredSlotKey = slotKey;
        renderEquipmentModal();
      });
      slotCard.addEventListener("dragover", (event) => {
        const draggedItem = InventoryService.getItemById(appState.saveData, appState.equipmentModal.dragItemId);

        if (!draggedItem || !InventoryService.canEquipIntoSlot(appState.saveData, unit, draggedItem, slotKey)) {
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

      card.addEventListener("click", () => {
        appState.equipmentModal.hoveredItemId = itemId;
        renderEquipmentDetailPanel(unit);
      });
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
          const preferredSlotKey = selectedSlotKey && InventoryService.canEquipIntoSlot(appState.saveData, unit, InventoryService.getItemById(appState.saveData, itemId), selectedSlotKey)
            ? selectedSlotKey
            : null;
          const item = InventoryService.equipItemToUnit(appState.saveData, unit.id, itemId, preferredSlotKey);
          persistSession(appState.saveData, appState.settings);
          showToast(`${unit.name}이(가) ${item.name} 장착`);
          renderEquipmentModal();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    host.querySelectorAll("[data-equipment-page]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.equipmentModal.hoveredItemId = null;
        appState.equipmentModal.page = button.dataset.equipmentPage === "next"
          ? Math.min(totalPages, currentPage + 1)
          : Math.max(1, currentPage - 1);
        renderEquipmentModal();
      });
    });

    host.querySelectorAll("[data-show-equipment-summary]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.equipmentModal.hoveredItemId = null;
        appState.equipmentModal.hoveredSlotKey = null;
        renderEquipmentModal();
      });
    });

    host.querySelectorAll("[data-modal-equip]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const targetItem = InventoryService.getItemById(appState.saveData, button.dataset.modalEquip);
          const preferredSlotKey = selectedSlotKey && InventoryService.canEquipIntoSlot(appState.saveData, unit, targetItem, selectedSlotKey)
            ? selectedSlotKey
            : null;
          const item = InventoryService.equipItemToUnit(appState.saveData, unit.id, button.dataset.modalEquip, preferredSlotKey);
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
    appState.equipmentModal.previewSlotKey = null;
    appState.equipmentModal.dragItemId = null;
    appState.equipmentModal.page = 1;
    renderEquipmentModal();
  }

  function renderSkillDetailPanel(unit) {
    const detailTarget = getElement("menu-skill-detail");

    if (!detailTarget) {
      return;
    }

    const selectedSkill = resolveSkillDetailSelection(unit, appState.skillModal.hoveredSkillId);
    appState.skillModal.hoveredSkillId = selectedSkill ? selectedSkill.id : null;
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

    const activeSkills = SkillsService.getActiveSkillsForUnit(unit).map((skill) => normalizeSkillForDetail(unit, skill));
    const passiveSkills = SkillsService.getSkillsForUnit(unit);
    const loadout = SkillsService.getActiveSkillLoadout(unit).map((skill) => normalizeSkillForDetail(unit, skill));
    const passiveTotalPages = Math.max(1, Math.ceil(passiveSkills.length / PASSIVE_SKILL_MODAL_PAGE_SIZE));
    const passiveCurrentPage = Math.max(1, Math.min(passiveTotalPages, Number(appState.skillModal.passivePage || 1)));
    const passivePageStart = (passiveCurrentPage - 1) * PASSIVE_SKILL_MODAL_PAGE_SIZE;
    const visiblePassiveSkills = passiveSkills.slice(passivePageStart, passivePageStart + PASSIVE_SKILL_MODAL_PAGE_SIZE);

    appState.skillModal.passivePage = passiveCurrentPage;

    host.innerHTML = [
      '<div class="modal-backdrop menu-modal-backdrop">',
      '  <div class="modal-panel modal-panel-wide skill-modal-panel">',
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
              `<article class="inventory-card skill-card skill-card-active ${equippedIndex >= 0 ? "is-equipped" : ""}" draggable="true" data-modal-skill="${skill.id}">`,
              '  <div class="item-title-row skill-card-header">',
              `    <strong class="card-title">${skill.name}</strong>`,
              '    <div class="inventory-meta skill-card-inline-meta">',
              `      <span class="meta-pill">Lv.${skill.skillLevel} / ${skill.maxSkillLevel}</span>`,
              `      <span class="meta-pill is-cyan">${equippedIndex >= 0 ? getSkillSlotLabel(equippedIndex) : "미장착"}</span>`,
              `      <span class="meta-pill">재사용 ${skill.cooldown}턴</span>`,
              `      <span class="meta-pill">${getSkillRangeLabel(skill)}</span>`,
              "    </div>",
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
      '          <div class="item-title-row">',
      '            <h3>패시브 스킬</h3>',
      `            <span class="meta-pill is-muted">${passiveCurrentPage} / ${passiveTotalPages}</span>`,
      "          </div>",
      passiveSkills.length
        ? `          <div class="skill-catalog-list passive-skill-list">${visiblePassiveSkills.map((skill) => (
            `<article class="inventory-card skill-card is-passive" data-passive-skill="${skill.id}"><div class="item-title-row"><strong class="card-title">${skill.name}</strong><span class="card-subtitle">${skill.sourceClassName === "special" ? "SPECIAL" : "PASSIVE"}</span></div><p>${skill.description}</p></article>`
          )).join("")}</div>
          <div class="list-pagination passive-skill-pagination">
            <button class="ghost-button small-button" type="button" data-passive-page="prev" ${passiveCurrentPage <= 1 ? "disabled" : ""}>이전</button>
            <span class="pagination-label">${passiveCurrentPage} / ${passiveTotalPages}</span>
            <button class="ghost-button small-button" type="button" data-passive-page="next" ${passiveCurrentPage >= passiveTotalPages ? "disabled" : ""}>다음</button>
          </div>`
        : '          <div class="inventory-card"><p>보유한 패시브 스킬이 없습니다.</p></div>',
      "        </section>",
      "      </div>",
      '      <section id="menu-skill-detail" class="modal-card skill-detail-panel"></section>',
      "    </div>",
      "  </div>",
      "</div>"
    ].join("");

    const backdrop = host.querySelector(".menu-modal-backdrop");
    const selectSkillDetail = (skillId) => {
      appState.skillModal.hoveredSkillId = skillId || null;
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
      slotCard.classList.toggle("is-selected", !!slotSkillId && slotSkillId === appState.skillModal.hoveredSkillId);

      slotCard.addEventListener("click", () => {
        selectSkillDetail(slotSkillId);
      });
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
      card.classList.toggle("is-selected", skillId === appState.skillModal.hoveredSkillId);

      card.addEventListener("click", () => {
        selectSkillDetail(skillId);
      });
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
      card.classList.toggle("is-selected", skillId === appState.skillModal.hoveredSkillId);
      card.addEventListener("click", () => {
        selectSkillDetail(skillId);
      });
    });

    host.querySelectorAll("[data-passive-page]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.skillModal.passivePage = button.dataset.passivePage === "next"
          ? Math.min(passiveTotalPages, passiveCurrentPage + 1)
          : Math.max(1, passiveCurrentPage - 1);
        renderSkillModal();
      });
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
    appState.skillModal.passivePage = 1;
    renderSkillModal();
  }

  function renderPartyManagement() {
    const rosterTarget = getElement("menu-roster-list");
    const detailTarget = getElement("menu-unit-detail") || document.createElement("div");
    const selectedUnit = ensureSelectedMenuUnit();
    const roster = (appState.saveData && appState.saveData.roster) || [];

    if (!appState.saveData || !roster.length) {
      rosterTarget.innerHTML = "";
      detailTarget.textContent = "파티 데이터가 없습니다.";
      return;
    }

    const sortedRoster = sortPartyRoster(roster, getSelectedPartyIds().slice(0, MAX_SORTIE_SIZE));
    const totalPages = Math.max(1, Math.ceil(sortedRoster.length / ROSTER_PAGE_SIZE));
    let currentPage = Math.max(1, Math.min(totalPages, Number(appState.rosterView.page || 1)));

    appState.rosterView.page = currentPage;
    const pageStart = (currentPage - 1) * ROSTER_PAGE_SIZE;
    const visibleRoster = sortedRoster.slice(pageStart, pageStart + ROSTER_PAGE_SIZE);

    rosterTarget.innerHTML = visibleRoster.map((unit) => {
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
    }).join("") + [
      '<div class="list-pagination roster-pagination">',
      `  <button class="ghost-button small-button" type="button" data-roster-page="prev" ${currentPage <= 1 ? "disabled" : ""}>이전</button>`,
      `  <span class="pagination-label">${currentPage} / ${totalPages}</span>`,
      `  <button class="ghost-button small-button" type="button" data-roster-page="next" ${currentPage >= totalPages ? "disabled" : ""}>다음</button>`,
      "</div>"
    ].join("");

    detailTarget.innerHTML = buildUnitFullDetailMarkup(selectedUnit);
    appState.cachedUnitDetailUnitId = selectedUnit.id;
    appState.cachedUnitDetailMarkup = detailTarget.innerHTML;
    detailTarget.onclick = (event) => handleUnitDetailModalInteraction(event, selectedUnit.id);

    rosterTarget.querySelectorAll("[data-menu-unit]").forEach((button) => {
      button.addEventListener("click", () => {
        const unitId = button.dataset.menuUnit;
        appState.selectedMenuUnitId = unitId;

        renderMainMenu();
        openDetailModal("unit", unitId);
      });
    });

    rosterTarget.querySelectorAll("[data-roster-page]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.rosterView.page = button.dataset.rosterPage === "next"
          ? Math.min(totalPages, currentPage + 1)
          : Math.max(1, currentPage - 1);
        renderPartyManagement();
      });
    });
  }

  function syncInventoryToolbarState() {
    const currentCategory = appState.inventoryView.category === "consumable" ? "consumable" : "equipment";
    const typeFilter = getElement("menu-inventory-type-filter");
    const equippedFilter = getElement("menu-inventory-equipped-filter");

    document.querySelectorAll("[data-inventory-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.inventoryTab === currentCategory);
    });

    if (typeFilter) {
      typeFilter.disabled = currentCategory === "consumable";
      typeFilter.value = currentCategory === "consumable" ? "consumable" : appState.inventoryView.type;
    }

    if (equippedFilter) {
      equippedFilter.disabled = currentCategory === "consumable";
      equippedFilter.value = appState.inventoryView.equipped;
    }
  }

  function setInventoryCategory(category) {
    appState.inventoryView.category = category === "consumable" ? "consumable" : "equipment";

    if (appState.inventoryView.category === "consumable") {
      appState.inventoryView.type = "consumable";
      appState.inventoryView.equipped = "all";
    } else if (appState.inventoryView.type === "consumable") {
      appState.inventoryView.type = "all";
    }

    appState.inventoryView.page = 1;
    syncInventoryToolbarState();
  }

  function syncShopCategoryTabs() {
    const currentCategory = appState.shopView.category === "consumable" ? "consumable" : "equipment";

    document.querySelectorAll("[data-shop-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.shopTab === currentCategory);
    });
  }

  function setShopCategory(category) {
    appState.shopView.category = category === "consumable" ? "consumable" : "equipment";
    appState.shopView.page = 1;
    syncShopCategoryTabs();
  }

  function renderInventoryList() {
    const target = getElement("menu-inventory-list");
    const selectedUnit = ensureSelectedMenuUnit();
    const inventory = appState.saveData ? appState.saveData.inventory || [] : [];
    const inventoryCategory = appState.inventoryView.category === "consumable" ? "consumable" : "equipment";
    const categoryFilteredItems = inventory.filter((item) => (
      inventoryCategory === "consumable"
        ? InventoryService.isConsumable(item)
        : InventoryService.isEquipment(item)
    ));
    const filteredItems = InventoryService.sortInventory(
      InventoryService.filterInventory(categoryFilteredItems, {
        type: inventoryCategory === "consumable" ? "consumable" : appState.inventoryView.type,
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
    syncInventoryToolbarState();

    if (!filteredItems.length) {
      target.innerHTML = '<div class="inventory-card"><p>조건에 맞는 아이템이 없습니다.</p></div>';
      return;
    }

    target.innerHTML = visibleItems.map((item) => {
      const rarity = InventoryService.getRarityMeta(item.rarity);
      const equipDisabled = InventoryService.isEquipment(item) && !item.equippedBy ? "" : "disabled";
      const unequipDisabled = item.equippedBy ? "" : "disabled";
      const useDisabled = !selectedUnit || !InventoryService.isConsumable(item) ? "disabled" : "";
      const ownerText = item.equippedBy
        ? `${getUnitNameById(item.equippedBy)} / ${InventoryService.getSlotLabel(item.equippedSlotKey || InventoryService.getCompatibleSlotKeys(item)[0] || item.slot)}`
        : "미장착";

      return [
        `<article class="inventory-card compact-inventory-card rarity-${item.rarity} interactive-summary-card" data-open-detail="inventory" data-detail-id="${item.id}">`,
        '  <div class="compact-inventory-card-top">',
        `    <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        [
          '    <div class="inventory-meta inventory-inline-meta">',
          `    <span class="meta-pill">${InventoryService.getTypeLabel(item.type || item.slot)}</span>`,
          `    <span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${ownerText}</span>`,
          "    </div>",
          "  </div>"
        ].join(""),
        '  <div class="button-row">',
        `    <button class="secondary-button small-button" type="button" data-menu-equip="${item.id}" ${equipDisabled}>${item.equippedBy ? "장착중" : "장착"}</button>`,
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
          showToast(formatConsumableUseMessage(unit, result));
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderShopList() {
    const target = getElement("menu-shop-list");
    const statusTarget = getElement("menu-shop-status");
    const shopState = syncShopState(false);
    const shopCategory = appState.shopView.category === "consumable" ? "consumable" : "equipment";
    const lineupIds = shopState && Array.isArray(shopState.lineupIds)
      ? shopState.lineupIds
      : [];
    const lineupProducts = lineupIds
      .map((productId) => InventoryService.SHOP_CATALOG.find((product) => product.id === productId))
      .filter((product) => product && InventoryService.isAvailableInShop(product));
    const filteredProducts = lineupProducts.filter((product) => (
      (
        shopCategory === "consumable"
          ? InventoryService.isConsumable(product)
          : InventoryService.isEquipment(product)
      )
    ));
    const totalProducts = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(totalProducts / SHOP_PAGE_SIZE));
    const currentPage = Math.max(1, Math.min(totalPages, Number(appState.shopView.page || 1)));
    const pageStart = (currentPage - 1) * SHOP_PAGE_SIZE;
    const visibleProducts = filteredProducts.slice(pageStart, pageStart + SHOP_PAGE_SIZE);

    appState.shopView.page = currentPage;
    syncShopCategoryTabs();

    if (statusTarget) {
      const nextRefreshText = shopState && shopState.nextRefreshAt
        ? `${new Date(shopState.nextRefreshAt).toLocaleString("ko-KR")} (${formatRemainingRefresh(shopState.nextRefreshAt)} 후)`
        : "알 수 없음";
      statusTarget.innerHTML = [
        `<p class="status-line is-gold">보유 골드: ${appState.saveData ? appState.saveData.partyGold : 0}G</p>`,
        `<p class="status-line">인벤토리 수: ${appState.saveData && appState.saveData.inventory ? appState.saveData.inventory.length : 0}개</p>`,
        `<p class="status-line">소모품 수: ${appState.saveData && appState.saveData.inventory ? appState.saveData.inventory.filter((item) => InventoryService.isConsumable(item)).length : 0}개</p>`,
        `<p class="status-line">상품 수: ${totalProducts}개 / 페이지 ${currentPage} / ${totalPages}</p>`,
        `<p class="status-line">다음 갱신: ${nextRefreshText}</p>`
      ].join("");
    }

    if (!filteredProducts.length) {
      target.innerHTML = '<article class="shop-card"><p>선택한 분류의 상품이 없습니다.</p></article>';
      return;
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
            Math.ceil(filteredProducts.length / SHOP_PAGE_SIZE),
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
    const manualState = TavernService.getManualRefreshState(appState.saveData);
    const nextRefreshText = tavern && tavern.nextRefreshAt
      ? `${new Date(tavern.nextRefreshAt).toLocaleString("ko-KR")} (${formatRemainingRefresh(tavern.nextRefreshAt)} 후)`
      : "알 수 없음";

    if (statusTarget) {
      statusTarget.innerHTML = [
        '<div class="tavern-status-grid">',
        `  <p class="status-line is-gold">보유 골드: ${appState.saveData.partyGold}G</p>`,
        `  <p class="status-line">파티 리더: ${getLeaderUnit(appState.saveData) ? getLeaderUnit(appState.saveData).name : "없음"}</p>`,
        `  <p class="status-line">현재 명단: ${Math.min(4, tavern && tavern.lineup ? tavern.lineup.length : 0)}명</p>`,
        `  <p class="status-line">길드 대기열: ${Math.min(4, tavern && tavern.lineup ? tavern.lineup.filter((candidate) => !candidate.recruitedAt).length : 0)}명</p>`,
        `  <p class="status-line tavern-status-wide">다음 교대: ${nextRefreshText}</p>`,
        '</div>'
      ].join("");
    }

    renderDetailHeaderActions();

    const lineup = ((tavern && tavern.lineup) || []).slice(0, 4);

    if (!lineup.length) {
      listTarget.innerHTML = '<article class="shop-card"><p>현재 주점에 머무는 모험가가 없습니다.</p></article>';
      return;
    }

    listTarget.innerHTML = lineup.map((candidate) => {
      const unit = candidate.unit;
      const rankClass = `rank-${String(candidate.guildRank || "D").toLowerCase().replace("+", "plus")}`;
      const recruited = !!candidate.recruitedAt;
      const signaturePassives = getSignaturePassiveDefinitions(unit, candidate);
      const potentialMeta = StatsService.getPotentialMeta(unit);
      const isSupreme = candidate.guildRank === "SSS";

      return [
        `<article class="shop-card tavern-card rarity-${candidate.rarity} ${isSupreme ? "is-supreme-candidate" : ""} interactive-summary-card" data-open-detail="tavern" data-detail-id="${candidate.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${rankClass}">${candidate.guildRank}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill is-violet">잠재 ${potentialMeta.label}</span>`,
        `    <span class="meta-pill ${signaturePassives.length ? "is-cyan" : "is-muted"}">고유 ${signaturePassives.length}</span>`,
        `    <span class="meta-pill is-gold">${candidate.hireCost}G</span>`,
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

    let stages = BattleService.getStageCatalog(appState.saveData).filter((stage) => !stage.hidden);
    let selectedStage = stages.find((stage) => stage.selected) || stages[0] || null;
    const tutorialStages = stages.filter((stage) => stage.category === "tutorial");
    const tutorialsCleared = tutorialStages.length > 0 && tutorialStages.every((stage) => stage.cleared);
    const endlessStage = stages.find((stage) => stage.id === "endless-rift" && stage.available) || null;

    if (!tutorialsCleared) {
      appState.activeStageTab = "all";
    } else if (appState.activeStageTab === "all") {
      appState.activeStageTab = "main";

      const hasActiveBattle =
        appState.saveData.stageStatus === "in_progress" &&
        appState.saveData.battleState;
      const shouldDefaultToEndless =
        endlessStage &&
        !hasActiveBattle &&
        (!selectedStage || selectedStage.category === "tutorial");

      if (shouldDefaultToEndless) {
        BattleService.selectCampaignStage(appState.saveData, endlessStage.id);
        persistSession(appState.saveData, appState.settings);
        stages = BattleService.getStageCatalog(appState.saveData).filter((stage) => !stage.hidden);
        selectedStage = stages.find((stage) => stage.selected) || stages[0] || null;
      }
    }

    const visibleStages = tutorialsCleared
      ? stages.filter((stage) => (
          appState.activeStageTab === "prologue"
            ? stage.category === "tutorial"
            : (stage.category === "main" || stage.id === "endless-rift")
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

    const focusStage = orderedVisibleStages.find((stage) => stage.selected) || orderedVisibleStages[0] || selectedStage;

    if (focusTarget) {
      focusTarget.innerHTML = [
        tutorialsCleared
          ? '<div class="stage-panel-tabs">'
            + `<button class="stage-panel-tab ${appState.activeStageTab === "main" ? "active" : ""}" type="button" data-stage-tab="main">메인 작전</button>`
            + `<button class="stage-panel-tab ${appState.activeStageTab === "prologue" ? "active" : ""}" type="button" data-stage-tab="prologue">프롤로그</button>`
            + "</div>"
          : "",
        buildStageFocusMarkup(focusStage)
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

      if (stage.cleared) {
        classes.push("is-cleared");
      }

      return [
        `<article class="${classes.join(" ")} interactive-summary-card" data-select-stage="${stage.id}">`,
        stage.cleared ? '  <div class="stage-clear-badge">완료</div>' : "",
        `  <div class="item-title-row"><strong>${stage.order}. ${stage.name}</strong><span>${stage.available ? "개방" : "잠김"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${stage.category === "main" ? "is-gold" : "is-cyan"}">${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"}</span>`,
        `    <span class="meta-pill is-gold">${stage.rewardGold}G</span>`,
        `    <span class="meta-pill ${stage.cleared ? "is-cyan" : "is-muted"}">${stage.cleared ? "클리어" : "미클리어"}</span>`,
        `    <span class="meta-pill ${stage.inProgress ? "is-crimson" : "is-muted"}">${stage.inProgress ? "진행 중" : "준비"}</span>`,
        "  </div>",
        `  <p>${stage.victoryLabel}${stage.id === "endless-rift" ? ` / ${stage.objective}` : ""}</p>`,
        '  <div class="button-row">',
        `    <button class="${stage.selected ? "secondary-button" : "primary-button"} small-button" type="button" data-stage-id="${stage.id}" ${!stage.available || stage.selected ? "disabled" : ""}>${stage.selected ? "선택됨" : "선택"}</button>`,
        `    <button class="ghost-button small-button" type="button" data-stage-detail="${stage.id}">상세보기</button>`,
        "  </div>",
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

    target.querySelectorAll("[data-select-stage]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) {
          return;
        }

        handleStageSelection(card.dataset.selectStage);
      });
    });

    target.querySelectorAll("[data-stage-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleStageSelection(button.dataset.stageId);
      });
    });

    target.querySelectorAll("[data-stage-detail]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDetailModal("stage", button.dataset.stageDetail);
      });
    });
  }

  function handleStageSelection(stageId) {
    try {
      if (!appState.saveData || appState.saveData.stageId === stageId) {
        return;
      }

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
    syncShopState(false);
    renderSortieQuickBar();
    renderPartyManagement();
    renderStageList();
    renderInventoryList();
    renderSettingsList();
    renderShopList();
    renderTavern();
    renderRewardCodex();
    setActiveMainPanel(appState.activeMainPanel, { preserveModals: true });
    getElement("menu-inventory-sort").value = appState.inventoryView.sort;
    getElement("menu-inventory-type-filter").value = appState.inventoryView.type;
    getElement("menu-inventory-rarity-filter").value = appState.inventoryView.rarity;
    getElement("menu-inventory-equipped-filter").value = appState.inventoryView.equipped;
    syncInventoryToolbarState();
    const selectedStage = getSelectedStageMeta();
    const startBattleButton = getElement("start-battle-button");
    startBattleButton.textContent = `출격: ${selectedStage ? selectedStage.name : (appState.saveData ? appState.saveData.stageId : "stage")}`;
    startBattleButton.disabled = !appState.saveData || !selectedStage || !selectedStage.available;

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
    appState.quickSwapSlotIndex = null;
    appState.rosterView.page = 1;
    appState.sortieManagerView.page = 1;
    appState.inventoryView.page = 1;
    appState.shopView.category = "equipment";
    appState.shopView.page = 1;
    InventoryService.normalizeInventoryState(appState.saveData);
    StatsService.normalizeRosterProgression(appState.saveData);
    SkillsService.normalizeRosterLearnedSkills(appState.saveData);
    syncTavernState(false);
    syncShopState(false);
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
    appState.quickSwapSlotIndex = null;
    appState.progressionDrafts = {};
    appState.activeMainPanel = "party";
    appState.rosterView.page = 1;
    appState.sortieManagerView.page = 1;
    appState.inventoryView.sort = "rarity";
    appState.inventoryView.type = "all";
    appState.inventoryView.rarity = "all";
    appState.inventoryView.equipped = "all";
    appState.inventoryView.page = 1;
    appState.shopView.category = "equipment";
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
        const selectedStage = getSelectedStageMeta();

        if (!selectedStage || !selectedStage.available) {
          throw new Error("현재 선택한 스테이지에는 출격할 수 없습니다.");
        }

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
    document.querySelectorAll("[data-inventory-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        setInventoryCategory(button.dataset.inventoryTab);
        renderInventoryList();
      });
    });
    document.querySelectorAll("[data-shop-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        setShopCategory(button.dataset.shopTab);
        renderShopList();
      });
    });
    getElement("tavern-manual-refresh-button").addEventListener("click", () => {
      if (!appState.saveData || !TavernService) {
        return;
      }

      try {
        const refreshResult = TavernService.useManualRefresh(appState.saveData);
        appState.saveData.tavern = refreshResult.tavern;
        renderDetailHeaderActions();
        renderTavern();
        persistSession(appState.saveData, appState.settings);
        showToast(`주점 명단을 수동으로 새로 교체했습니다. (${refreshResult.manualState.remaining}/${refreshResult.manualState.limit})`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    getElement("tavern-paid-refresh-button").addEventListener("click", () => {
      if (!appState.saveData || !TavernService) {
        return;
      }

      try {
        const refreshResult = TavernService.usePaidRefresh(appState.saveData);
        appState.saveData.tavern = refreshResult.tavern;
        renderDetailHeaderActions();
        renderTavern();
        persistSession(appState.saveData, appState.settings);
        showToast(`주점 명단을 ${TavernService.PAID_MANUAL_REFRESH_COST}G로 새로 교체했습니다.`);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    getElement("menu-inventory-sort").addEventListener("change", (event) => {
      appState.inventoryView.sort = event.target.value;
      appState.inventoryView.page = 1;
      renderInventoryList();
    });
    getElement("menu-inventory-type-filter").addEventListener("change", (event) => {
      if (event.target.value === "consumable") {
        setInventoryCategory("consumable");
      } else {
        if (appState.inventoryView.category === "consumable") {
          setInventoryCategory("equipment");
        }
        appState.inventoryView.type = event.target.value;
        appState.inventoryView.page = 1;
      }
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
    document.addEventListener("mouseover", handleStatTooltipMouseOver);
    document.addEventListener("mouseout", handleStatTooltipMouseOut);
    window.addEventListener("scroll", handleFloatingStatTooltipViewportChange, true);
    window.addEventListener("resize", handleFloatingStatTooltipViewportChange);
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
    syncShopState(true);
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
    document.body.classList.add("use-floating-stat-tooltip");
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
