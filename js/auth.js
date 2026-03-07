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
      equipped: "all"
    },
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
      badge.textContent = `현재 사용자: ${appState.currentUserId}`;
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
      `슬롯: ${saveData.slotId}`,
      `스테이지: ${selectedStage ? selectedStage.name : saveData.stageId}`,
      `상태: ${saveData.stageStatus}`,
      `리더: ${leaderUnit ? `${leaderUnit.name} (${leaderUnit.guildRank || "D"})` : "없음"}`,
      `클리어 수: ${(campaign.clearedStageIds || []).length}`,
      `출전 인원: ${(saveData.selectedPartyIds || []).length}/3`,
      `최근 결과: ${lastResult}`,
      `최근 균열 런: ${endlessRun ? `${endlessRun.floor}층 / ${endlessRun.result === "defeat" ? "패배" : "돌파"}` : "없음"}`,
      `진행 중 런: ${endlessCurrentRun ? `${endlessCurrentRun.highestFloor}층 도달 / 정예 ${endlessCurrentRun.eliteDefeated} / 피해 ${endlessCurrentRun.damageDealt}` : "없음"}`,
      `주점 교대: ${saveData.tavern && saveData.tavern.nextRefreshAt ? new Date(saveData.tavern.nextRefreshAt).toLocaleString("ko-KR") : "미정"}`,
      `보유 골드: ${saveData.partyGold}`,
      `마지막 저장: ${new Date(saveData.lastSavedAt).toLocaleString("ko-KR")}`
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
      `대표 유닛: ${leadUnit ? `${leadUnit.name} (${leadUnit.className} / ${leadUnit.guildRank || "D"})` : "없음"}`,
      `현재 출격지: ${selectedStage ? selectedStage.name : (saveData ? saveData.stageId : "미정")}`,
      `무한 균열 최고 층: ${saveData && saveData.endless ? saveData.endless.bestFloor : 1}`,
      `보유 유물 수: ${saveData && saveData.endless && saveData.endless.relicIds ? saveData.endless.relicIds.length : 0}`,
      `현재 런 요약: ${endlessCurrentRun ? `시작 ${endlessCurrentRun.floorStart}층 / 돌파 ${endlessCurrentRun.floorsCleared} / 정예 ${endlessCurrentRun.eliteDefeated}` : "없음"}`
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
      if (unitId === "hero-1") {
        throw new Error("주인공은 출전 파티에서 제외할 수 없습니다.");
      }

      appState.saveData.selectedPartyIds = selectedPartyIds.filter((id) => id !== unitId);
      return false;
    }

    if (selectedPartyIds.length >= 3) {
      throw new Error("출전 파티는 최대 3명까지 선택할 수 있습니다.");
    }

    selectedPartyIds.push(unitId);
    appState.saveData.selectedPartyIds = selectedPartyIds;
    return true;
  }

  function renderPartyManagement() {
    const rosterTarget = getElement("menu-roster-list");
    const detailTarget = getElement("menu-unit-detail");
    const selectedUnit = ensureSelectedMenuUnit();

    if (!appState.saveData || !appState.saveData.roster || !appState.saveData.roster.length) {
      rosterTarget.innerHTML = "";
      detailTarget.textContent = "파티 데이터가 없습니다.";
      return;
    }

    rosterTarget.innerHTML = appState.saveData.roster.map((unit) => {
      const weapon = InventoryService.getItemById(appState.saveData, unit.weapon);
      const classes = ["roster-button"];
      const isLeader = appState.saveData.leaderUnitId === unit.id;

      if (unit.id === appState.selectedMenuUnitId) {
        classes.push("active");
      }

      return [
        `<button class="${classes.join(" ")}" type="button" data-menu-unit="${unit.id}">`,
        `  <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
        '  <div class="roster-meta">',
        `    <span class="meta-pill rank-${String(unit.guildRank || "D").toLowerCase().replace("+", "plus")}">${unit.guildRank || "D"}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill">HP ${unit.maxHp}</span>`,
        `    <span class="meta-pill">${unit.statPoints || 0}P</span>`,
        `    <span class="meta-pill ${isLeader ? "is-gold" : "is-muted"}">${isLeader ? "리더" : "일반"}</span>`,
        `    <span class="meta-pill ${isUnitSelectedForSortie(unit.id) ? "is-cyan" : "is-muted"}">${isUnitSelectedForSortie(unit.id) ? "출전 중" : "후방 대기"}</span>`,
        `    <span class="meta-pill ${weapon ? "is-gold" : "is-muted"}">${weapon ? weapon.name : "무기 없음"}</span>`,
        "  </div>",
        "</button>"
      ].join("");
    }).join("");

    const equippedItems = (selectedUnit.equippedItemIds || [])
      .map((itemId) => InventoryService.getItemById(appState.saveData, itemId))
      .filter(Boolean)
      .map((item) => {
        const rarity = InventoryService.getRarityMeta(item.rarity);
        return `<span class="meta-pill rarity-${item.rarity}">${item.name} (${rarity.label})</span>`;
      })
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
      `  <p>Lv.${selectedUnit.level} / EXP ${selectedUnit.exp} / 남은 포인트 ${selectedUnit.statPoints || 0}</p>`,
      '  <div class="detail-stats">',
      `    <span class="meta-pill">HP ${selectedUnit.maxHp}</span>`,
      `    <span class="meta-pill">STR ${selectedUnit.str}</span>`,
      `    <span class="meta-pill">SKL ${selectedUnit.skl}</span>`,
      `    <span class="meta-pill">SPD ${selectedUnit.spd}</span>`,
      `    <span class="meta-pill">DEF ${selectedUnit.def}</span>`,
      `    <span class="meta-pill">MOV ${selectedUnit.mov}</span>`,
      "  </div>",
      `  <p>길드 등급: <span class="meta-pill rank-${String(selectedUnit.guildRank || "D").toLowerCase().replace("+", "plus")}">${formatRankBadge(selectedUnit.guildRank || "D")}</span></p>`,
      `  <p>장착 중: ${equippedItems || "없음"}</p>`,
      `  <p>출전 상태: ${isUnitSelectedForSortie(selectedUnit.id) ? "출전 파티" : "대기 인원"} / ${appState.saveData.leaderUnitId === selectedUnit.id ? "현재 리더" : "일반 멤버"}</p>`,
      `  <p>전직: ${promotionSummary}</p>`,
      `  <p>스킬: ${SkillsService.describeSkills(selectedUnit)}</p>`,
      `  <p>액티브: ${SkillsService.describeActiveSkills(selectedUnit)}</p>`,
      '  <div class="detail-actions">',
      `    <button class="secondary-button small-button" type="button" data-set-leader="true" ${appState.saveData.leaderUnitId === selectedUnit.id ? "disabled" : ""}>리더 지정</button>`,
      '    <button class="secondary-button small-button" type="button" data-unequip-all="true">전체 해제</button>',
      `    <button class="secondary-button small-button" type="button" data-toggle-sortie="true">${isUnitSelectedForSortie(selectedUnit.id) ? "후방 대기" : "출전 등록"}</button>`,
      promotionOptions.map((promotion) => (
        `<button class="secondary-button small-button" type="button" data-promote-class="${promotion.className}">${promotion.className} 전직</button>`
      )).join(""),
      StatsService.ALLOCATABLE_STATS.map((statName) => (
        `<button class="ghost-button small-button" type="button" data-menu-stat="${statName}">+ ${statName}</button>`
      )).join(""),
      "  </div>",
      "</div>"
    ].join("");

    rosterTarget.querySelectorAll("[data-menu-unit]").forEach((button) => {
      button.addEventListener("click", () => {
        appState.selectedMenuUnitId = button.dataset.menuUnit;
        renderMainMenu();
      });
    });

    detailTarget.querySelectorAll("[data-menu-stat]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          StatsService.allocateStatPoint(appState.saveData, appState.selectedMenuUnitId, button.dataset.menuStat);
          persistSession(appState.saveData, appState.settings);
          showToast(`${selectedUnit.name}의 ${button.dataset.menuStat} 상승`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    detailTarget.querySelectorAll("[data-unequip-all]").forEach((button) => {
      button.addEventListener("click", () => {
        (selectedUnit.equippedItemIds || []).slice().forEach((itemId) => {
          InventoryService.unequipItem(appState.saveData, itemId);
        });
        persistSession(appState.saveData, appState.settings);
        showToast(`${selectedUnit.name}의 장비를 해제했습니다.`);
      });
    });

    detailTarget.querySelectorAll("[data-promote-class]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const result = SkillsService.promoteUnit(selectedUnit, button.dataset.promoteClass);
          persistSession(appState.saveData, appState.settings);
          showToast(`${selectedUnit.name}: ${result.previousClassName} -> ${result.promotion.className}`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    detailTarget.querySelectorAll("[data-toggle-sortie]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const added = toggleSortieUnit(selectedUnit.id);
          persistSession(appState.saveData, appState.settings);
          showToast(added ? `${selectedUnit.name} 출전 등록` : `${selectedUnit.name} 후방 대기 전환`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    detailTarget.querySelectorAll("[data-set-leader]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          TavernService.setLeader(appState.saveData, selectedUnit.id);
          persistSession(appState.saveData, appState.settings);
          showToast(`${selectedUnit.name}을(를) 파티 리더로 지정했습니다.`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  function renderInventoryList() {
    const target = getElement("menu-inventory-list");
    const selectedUnit = ensureSelectedMenuUnit();
    const inventory = appState.saveData ? appState.saveData.inventory || [] : [];
    const visibleItems = InventoryService.sortInventory(
      InventoryService.filterInventory(inventory, {
        type: appState.inventoryView.type,
        rarity: appState.inventoryView.rarity,
        equipped: appState.inventoryView.equipped
      }),
      appState.inventoryView.sort
    );

    if (!visibleItems.length) {
      target.innerHTML = '<div class="inventory-card"><p>조건에 맞는 아이템이 없습니다.</p></div>';
      return;
    }

    target.innerHTML = visibleItems.map((item) => {
      const rarity = InventoryService.getRarityMeta(item.rarity);
      const canEquip = selectedUnit ? InventoryService.canEquip(selectedUnit, item) : false;
      const equipDisabled = !selectedUnit || !canEquip ? "disabled" : "";
      const unequipDisabled = item.equippedBy ? "" : "disabled";
      const useDisabled = !selectedUnit || !InventoryService.isConsumable(item) ? "disabled" : "";

      return [
        `<article class="inventory-card rarity-${item.rarity}">`,
        `  <div class="item-title-row"><strong class="card-title">${item.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        `  <div class="inventory-meta"><span class="meta-pill">${item.type || item.slot}</span><span class="meta-pill ${item.equippedBy ? "is-cyan" : "is-muted"}">${item.equippedBy ? `${getUnitNameById(item.equippedBy)} 장착 중` : "미장착"}</span></div>`,
        `  <p>${InventoryService.describeItem(item)}</p>`,
        '  <div class="button-row">',
        `    <button class="secondary-button small-button" type="button" data-menu-equip="${item.id}" ${equipDisabled}>${selectedUnit ? `${selectedUnit.name}에게 장착` : "유닛 선택 필요"}</button>`,
        `    <button class="secondary-button small-button" type="button" data-menu-use="${item.id}" ${useDisabled}>사용</button>`,
        `    <button class="ghost-button small-button" type="button" data-menu-unequip="${item.id}" ${unequipDisabled}>해제</button>`,
        "  </div>",
        "</article>"
      ].join("");
    }).join("");

    target.querySelectorAll("[data-menu-equip]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const item = InventoryService.equipItemToUnit(appState.saveData, appState.selectedMenuUnitId, button.dataset.menuEquip);
          persistSession(appState.saveData, appState.settings);
          showToast(`${getSelectedMenuUnit().name}이(가) ${item.name} 장착`);
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });

    target.querySelectorAll("[data-menu-unequip]").forEach((button) => {
      button.addEventListener("click", () => {
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
      button.addEventListener("click", () => {
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

    if (statusTarget) {
      statusTarget.textContent = formatShopStatus(appState.saveData);
    }

    target.innerHTML = InventoryService.SHOP_CATALOG.map((product) => {
      const rarity = InventoryService.getRarityMeta(product.rarity);
      const disabled = !appState.saveData || appState.saveData.partyGold < product.price ? "disabled" : "";

      return [
        `<article class="shop-card rarity-${product.rarity}">`,
        `  <div class="item-title-row"><strong class="card-title">${product.name}</strong><span class="card-subtitle">${rarity.label}</span></div>`,
        `  <div class="inventory-meta"><span class="meta-pill">${product.type}</span><span class="meta-pill is-gold">${product.price}G</span></div>`,
        `  <p>${product.description}</p>`,
        '  <div class="button-row">',
        `    <button class="primary-button small-button" type="button" data-shop-buy="${product.id}" ${disabled}>구매</button>`,
        "  </div>",
        "</article>"
      ].join("");
    }).join("");

    target.querySelectorAll("[data-shop-buy]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const item = InventoryService.purchaseItem(appState.saveData, button.dataset.shopBuy);
          persistSession(appState.saveData, appState.settings);
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
      statusTarget.textContent = [
        `보유 골드: ${appState.saveData.partyGold}G`,
        `파티 리더: ${getLeaderUnit(appState.saveData) ? getLeaderUnit(appState.saveData).name : "없음"}`,
        `현재 명단: ${(tavern && tavern.lineup ? tavern.lineup.length : 0)}명`,
        `다음 교대: ${nextRefreshText}`
      ].join("\n");
    }

    const lineup = (tavern && tavern.lineup) || [];

    if (!lineup.length) {
      listTarget.innerHTML = '<article class="shop-card"><p>현재 주점에 머무는 모험가가 없습니다.</p></article>';
      return;
    }

    listTarget.innerHTML = lineup.map((candidate) => {
      const unit = candidate.unit;
      const rankClass = `rank-${String(candidate.guildRank || "D").toLowerCase().replace("+", "plus")}`;
      const recruited = !!candidate.recruitedAt;
      const passiveSkillText = SkillsService.describeSkills(unit);
      const activeSkillText = SkillsService.describeActiveSkills(unit);

      return [
        `<article class="shop-card tavern-card rarity-${candidate.rarity}">`,
        `  <div class="item-title-row"><strong class="card-title">${unit.name}</strong><span class="card-subtitle">${unit.className}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${rankClass}">${candidate.guildRank}</span>`,
        `    <span class="meta-pill">Lv.${unit.level}</span>`,
        `    <span class="meta-pill is-gold">${candidate.hireCost}G</span>`,
        `    <span class="meta-pill">${candidate.rankTitle}</span>`,
        "  </div>",
        `  <p>기본 전력: HP ${unit.maxHp} / STR ${unit.str} / SKL ${unit.skl} / SPD ${unit.spd} / DEF ${unit.def} / MOV ${unit.mov}</p>`,
        `  <p>시작 장비: ${candidate.startingWeapon.name}</p>`,
        `  <p>패시브: ${passiveSkillText}</p>`,
        `  <p>액티브: ${activeSkillText}</p>`,
        '  <div class="button-row">',
        `    <button class="primary-button small-button" type="button" data-recruit-adventurer="${candidate.id}" ${recruited ? "disabled" : ""}>${recruited ? "영입 완료" : "영입"}</button>`,
        "  </div>",
        "</article>"
      ].join("");
    }).join("");

    listTarget.querySelectorAll("[data-recruit-adventurer]").forEach((button) => {
      button.addEventListener("click", () => {
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

    const stages = BattleService.getStageCatalog(appState.saveData);
    const selectedStage = stages.find((stage) => stage.selected) || stages[0] || null;

    if (focusTarget) {
      focusTarget.textContent = formatStageFocus(selectedStage);
    }

    target.innerHTML = stages.map((stage) => {
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
        `<button class="${classes.join(" ")}" type="button" data-stage-id="${stage.id}" ${stage.available ? "" : "disabled"}>`,
        `  <div class="item-title-row"><strong>${stage.order}. ${stage.name}</strong><span>${stage.available ? "개방" : "잠김"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill ${stage.category === "main" ? "is-gold" : "is-cyan"}">${stage.category === "main" ? "메인 콘텐츠" : "튜토리얼"}</span>`,
        `    <span class="meta-pill">${stage.victoryLabel}</span>`,
        `    <span class="meta-pill is-gold">${stage.rewardGold}G</span>`,
        `    <span class="meta-pill ${stage.cleared ? "is-cyan" : "is-muted"}">${stage.cleared ? "클리어" : "미클리어"}</span>`,
        `    <span class="meta-pill ${stage.inProgress ? "is-crimson" : "is-muted"}">${stage.inProgress ? "진행 중" : "준비"}</span>`,
        "  </div>",
        `  <p>${stage.objective}</p>`,
        `  <p>${stage.selected ? "현재 출격 대상" : "클릭하여 선택"}</p>`,
        "</button>"
      ].join("");
    }).join("");

    target.querySelectorAll("[data-stage-id]").forEach((button) => {
      button.addEventListener("click", () => {
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
        `<article class="${classes.join(" ")} rarity-${reward.rewardRarity}">`,
        `  <div class="item-title-row"><strong class="card-title">${reward.discovered ? reward.rewardName : "???"}</strong><span class="card-subtitle">${reward.discovered ? rarity.label : "미발견"}</span></div>`,
        '  <div class="inventory-meta">',
        `    <span class="meta-pill">${reward.stageName}</span>`,
        `    <span class="meta-pill is-crimson">보스 ${reward.bossName}</span>`,
        `    <span class="meta-pill">${reward.rewardType}</span>`,
        "  </div>",
        `  <p>${reward.discovered ? reward.rewardDescription : "해당 스테이지의 보스를 격파하면 정보가 기록됩니다."}</p>`,
        "</article>"
      ].join("");
    }).join("");
  }

  function renderMainMenu() {
    syncTavernState(false);
    getElement("player-summary").textContent = formatPlayerSummary(
      appState.currentUserId,
      appState.saveData,
      appState.settings
    );
    getElement("save-summary").textContent = formatSaveSummary(appState.saveData);
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
    const bundle = StorageService.ensureUserData(userId);
    appState.currentUserId = userId;
    appState.saveData = bundle.saveData;
    appState.settings = bundle.settings;
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
    StorageService.clearCurrentUser();
    appState.currentUserId = null;
    appState.saveData = null;
    appState.settings = null;
    appState.selectedMenuUnitId = null;
    appState.activeMainPanel = "party";
    appState.inventoryView.sort = "rarity";
    appState.inventoryView.type = "all";
    appState.inventoryView.rarity = "all";
    appState.inventoryView.equipped = "all";
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
    getElement("login-form").addEventListener("submit", handleLoginSubmit);
    getElement("register-form").addEventListener("submit", handleRegisterSubmit);
    getElement("start-battle-button").addEventListener("click", () => {
      try {
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
      renderInventoryList();
    });
    getElement("menu-inventory-type-filter").addEventListener("change", (event) => {
      appState.inventoryView.type = event.target.value;
      renderInventoryList();
    });
    getElement("menu-inventory-rarity-filter").addEventListener("change", (event) => {
      appState.inventoryView.rarity = event.target.value;
      renderInventoryList();
    });
    getElement("menu-inventory-equipped-filter").addEventListener("change", (event) => {
      appState.inventoryView.equipped = event.target.value;
      renderInventoryList();
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
