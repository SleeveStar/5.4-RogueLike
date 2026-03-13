/* 역할: localStorage 접근을 추상화하고 users/currentUser/save/settings 구조를 일관되게 관리한다. */

(function attachStorageService(global) {
  const MAX_SORTIE_SIZE = 5;
  const STORAGE_KEYS = {
    USERS: "users",
    CURRENT_USER: "currentUser"
  };

  const DEFAULT_SETTINGS = {
    cameraMode: "isometric",
    cameraRotation: 0,
    gridVisible: true,
    actionLogVisible: true,
    confirmEndTurn: true,
    preferredLanguage: "ko"
  };

  const DEFAULT_SAVE = {
    slotId: "slot-1",
    stageId: "prologue-field",
    stageStatus: "ready",
    turnNumber: 1,
    phase: "player",
    lastSavedAt: null,
    partyGold: 300,
    campaign: {
      currentStageIndex: 0,
      clearedStageIds: [],
      availableStageIds: ["prologue-field"],
      lastResult: null
    },
    endless: {
      currentFloor: 1,
      bestFloor: 1,
      relicIds: [],
      currentRun: null,
      lastRun: null
    },
    collection: {
      discoveredRewardIds: []
    },
    tutorial: {
      prologueFieldIntroShown: false,
      blacksmithIntroShown: false,
      partyIntroShown: false,
      tavernIntroShown: false,
      dispatchIntroShown: false
    },
    shop: {
      refreshBlock: null,
      nextRefreshAt: null,
      lineupIds: []
    },
    leaderUnitId: "hero-1",
    tavern: {
      refreshBlock: null,
      lastRefreshAt: null,
      nextRefreshAt: null,
      manualRefreshDate: null,
      manualRefreshUsed: 0,
      lineup: []
    },
    dispatch: {
      missionSeed: 1,
      availableMissions: [],
      activeMissions: [],
      completedMissions: [],
      reservedUnitIds: [],
      lastGeneratedAt: null,
      refreshCount: 0,
      refreshDateKey: null,
      recentDispatchLogs: []
    },
    selectedPartyIds: ["hero-1", "ally-2", "ally-3"],
    inventory: [
      {
        id: "iron-sword-01",
        name: "훈련용 검",
        type: "sword",
        slot: "weapon",
        might: 4,
        hit: 90,
        rangeMin: 1,
        rangeMax: 1,
        uses: 40,
        rarity: "common",
        equippedBy: "hero-1",
        equippedSlotKey: "weapon"
      },
      {
        id: "iron-lance-01",
        name: "훈련용 창",
        type: "lance",
        slot: "weapon",
        might: 5,
        hit: 82,
        rangeMin: 1,
        rangeMax: 1,
        uses: 35,
        rarity: "common",
        equippedBy: "ally-2",
        equippedSlotKey: "weapon"
      },
      {
        id: "practice-bow-01",
        name: "연습용 활",
        type: "bow",
        slot: "weapon",
        might: 4,
        hit: 88,
        rangeMin: 2,
        rangeMax: 2,
        uses: 35,
        rarity: "common",
        equippedBy: "ally-3",
        equippedSlotKey: "weapon"
      },
      {
        id: "oak-charm-01",
        name: "참나무 부적",
        type: "charm",
        slot: "charm",
        statBonus: {
          def: 1
        },
        rarity: "uncommon",
        equippedBy: "hero-1",
        equippedSlotKey: "charm"
      },
      {
        id: "leather-hood-01",
        name: "가죽 후드",
        type: "hood",
        slot: "head",
        statBonus: {
          skl: 1,
          spd: 1
        },
        rarity: "common",
        equippedBy: null,
        equippedSlotKey: null
      },
      {
        id: "march-boots-01",
        name: "행군 부츠",
        type: "boots",
        slot: "boots",
        statBonus: {
          mov: 1
        },
        rarity: "common",
        equippedBy: null,
        equippedSlotKey: null
      },
      {
        id: "bronze-ring-01",
        name: "청동 반지",
        type: "ring",
        slot: "ring",
        statBonus: {
          skl: 1
        },
        rarity: "common",
        equippedBy: null,
        equippedSlotKey: null
      },
      {
        id: "training-shield-01",
        name: "훈련 방패",
        type: "shield",
        slot: "subweapon",
        statBonus: {
          def: 1,
          maxHp: 1
        },
        rarity: "common",
        equippedBy: null,
        equippedSlotKey: null
      },
      {
        id: "potion-01",
        name: "회복 물약",
        type: "consumable",
        slot: "consumable",
        rarity: "common",
        effect: {
          kind: "heal",
          amount: 10
        },
        equippedBy: null,
        equippedSlotKey: null
      }
    ],
    roster: [
      {
        id: "hero-1",
        name: "리아",
        team: "ally",
        className: "로드",
        level: 1,
        exp: 0,
        hp: 18,
        maxHp: 18,
        str: 6,
        skl: 7,
        spd: 8,
        def: 4,
        mov: 5,
        x: 1,
        y: 5,
        acted: false,
        alive: true,
        weapon: "iron-sword-01",
        guildRank: "A",
        statPoints: 2,
        equippedItemIds: ["iron-sword-01"]
      },
      {
        id: "ally-2",
        name: "도윤",
        team: "ally",
        className: "랜서",
        level: 1,
        exp: 0,
        hp: 20,
        maxHp: 20,
        str: 7,
        skl: 5,
        spd: 6,
        def: 6,
        mov: 4,
        x: 2,
        y: 6,
        acted: false,
        alive: true,
        weapon: "iron-lance-01",
        guildRank: "B",
        statPoints: 1,
        equippedItemIds: ["iron-lance-01"]
      },
      {
        id: "ally-3",
        name: "세라",
        team: "ally",
        className: "아처",
        level: 1,
        exp: 0,
        hp: 16,
        maxHp: 16,
        str: 5,
        skl: 8,
        spd: 7,
        def: 3,
        mov: 5,
        x: 1,
        y: 6,
        acted: false,
        alive: true,
        weapon: "practice-bow-01",
        guildRank: "B",
        statPoints: 1,
        equippedItemIds: ["practice-bow-01"]
      }
    ],
    battleState: null
  };

  function readJSON(key, fallbackValue) {
    const rawValue = localStorage.getItem(key);

    if (!rawValue) {
      return cloneValue(fallbackValue);
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn("JSON parse failed for key:", key, error);
      return cloneValue(fallbackValue);
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getUsers() {
    return readJSON(STORAGE_KEYS.USERS, {});
  }

  function saveUsers(users) {
    return writeJSON(STORAGE_KEYS.USERS, users || {});
  }

  function getCurrentUser() {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  }

  function setCurrentUser(userId) {
    if (!userId) {
      throw new Error("현재 사용자 아이디가 필요합니다.");
    }

    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, userId);
    return userId;
  }

  function clearCurrentUser() {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }

  function getSaveKey(userId) {
    return `save:${userId}`;
  }

  function getSettingsKey(userId) {
    return `settings:${userId}`;
  }

  function buildDefaultSave(userId) {
    const saveData = cloneValue(DEFAULT_SAVE);
    saveData.ownerId = userId;
    saveData.lastSavedAt = new Date().toISOString();
    return saveData;
  }

  function buildDefaultSettings() {
    return cloneValue(DEFAULT_SETTINGS);
  }

  function normalizeSaveData(saveData, userId) {
    const normalized = Object.assign(buildDefaultSave(userId || saveData.ownerId || "guest"), saveData || {});

    normalized.campaign = Object.assign({}, cloneValue(DEFAULT_SAVE.campaign), normalized.campaign || {});
    normalized.endless = Object.assign({}, cloneValue(DEFAULT_SAVE.endless), normalized.endless || {});
    normalized.endless.currentFloor = Math.max(1, Number(normalized.endless.currentFloor || 1));
    normalized.endless.bestFloor = Math.max(normalized.endless.currentFloor, Number(normalized.endless.bestFloor || 1));
    normalized.endless.relicIds = cloneValue(normalized.endless.relicIds || []);
    normalized.endless.currentRun = cloneValue(normalized.endless.currentRun || null);
    normalized.endless.lastRun = cloneValue(normalized.endless.lastRun || null);
    normalized.collection = Object.assign({}, cloneValue(DEFAULT_SAVE.collection), normalized.collection || {});
    normalized.collection.discoveredRewardIds = cloneValue(normalized.collection.discoveredRewardIds || []);
    normalized.tutorial = Object.assign({}, cloneValue(DEFAULT_SAVE.tutorial), normalized.tutorial || {});
    normalized.shop = Object.assign({}, cloneValue(DEFAULT_SAVE.shop), normalized.shop || {});
    normalized.shop.lineupIds = cloneValue(normalized.shop.lineupIds || []);
    normalized.tavern = Object.assign({}, cloneValue(DEFAULT_SAVE.tavern), normalized.tavern || {});
    normalized.tavern.lineup = cloneValue(normalized.tavern.lineup || []);
    normalized.dispatch = Object.assign({}, cloneValue(DEFAULT_SAVE.dispatch), normalized.dispatch || {});
    normalized.dispatch.availableMissions = cloneValue(normalized.dispatch.availableMissions || []);
    normalized.dispatch.activeMissions = cloneValue(normalized.dispatch.activeMissions || []);
    normalized.dispatch.completedMissions = cloneValue(normalized.dispatch.completedMissions || []);
    normalized.dispatch.reservedUnitIds = cloneValue(normalized.dispatch.reservedUnitIds || []);
    normalized.dispatch.recentDispatchLogs = cloneValue(normalized.dispatch.recentDispatchLogs || []);
    normalized.inventory = cloneValue(normalized.inventory || []);
    normalized.roster = cloneValue(normalized.roster || []);
    normalized.selectedPartyIds = cloneValue(normalized.selectedPartyIds || []);

    const rosterIds = normalized.roster.map((unit) => unit.id);
    const reservedDispatchIds = normalized.dispatch.reservedUnitIds || [];
    normalized.selectedPartyIds = normalized.selectedPartyIds.filter((unitId) => rosterIds.includes(unitId) && !reservedDispatchIds.includes(unitId));

    normalized.selectedPartyIds = normalized.selectedPartyIds.slice(0, MAX_SORTIE_SIZE);
    normalized.leaderUnitId = rosterIds.includes(normalized.leaderUnitId)
      ? normalized.leaderUnitId
      : (rosterIds[0] || null);
    normalized.roster = normalized.roster.map((unit) => Object.assign({
      guildRank: "C",
      potentialScore: 36,
      trainingLevel: 0,
      trainingAttempts: 0,
      signaturePassiveIds: [],
      rankPromotionHistory: []
    }, unit));
    normalized.tavern.lineup = normalized.tavern.lineup.map((candidate) => Object.assign({
      signaturePassiveIds: candidate && candidate.signaturePassiveId ? [candidate.signaturePassiveId] : [],
      potentialScore: candidate && candidate.unit && candidate.unit.potentialScore ? candidate.unit.potentialScore : 36
    }, candidate, {
      unit: Object.assign({
        potentialScore: 36,
        trainingLevel: 0,
        trainingAttempts: 0,
        signaturePassiveIds: [],
        rankPromotionHistory: []
      }, candidate && candidate.unit ? candidate.unit : {})
    }));
    normalized.battleState = normalized.battleState || null;
    return normalized;
  }

  function normalizeSettings(settings) {
    return Object.assign({}, buildDefaultSettings(), settings || {});
  }

  function getUserSave(userId) {
    const saveData = readJSON(getSaveKey(userId), null);
    return saveData ? normalizeSaveData(saveData, userId) : null;
  }

  function setUserSave(userId, saveData) {
    if (!userId) {
      throw new Error("세이브를 저장할 사용자 아이디가 필요합니다.");
    }

    const nextSave = normalizeSaveData(cloneValue(saveData), userId);
    nextSave.lastSavedAt = new Date().toISOString();
    return writeJSON(getSaveKey(userId), nextSave);
  }

  function getUserSettings(userId) {
    const settings = readJSON(getSettingsKey(userId), null);
    return settings ? normalizeSettings(settings) : null;
  }

  function setUserSettings(userId, settings) {
    if (!userId) {
      throw new Error("설정을 저장할 사용자 아이디가 필요합니다.");
    }

    return writeJSON(getSettingsKey(userId), normalizeSettings(settings));
  }

  function ensureUserData(userId) {
    if (!userId) {
      throw new Error("유저 데이터 초기화를 위한 사용자 아이디가 필요합니다.");
    }

    const existingSave = getUserSave(userId);
    const existingSettings = getUserSettings(userId);

    const saveData = existingSave || setUserSave(userId, buildDefaultSave(userId));
    const settings = existingSettings || setUserSettings(userId, buildDefaultSettings());

    return {
      saveData,
      settings
    };
  }

  function getUserBundle(userId) {
    return {
      userId,
      saveData: getUserSave(userId),
      settings: getUserSettings(userId)
    };
  }

  global.StorageService = {
    KEYS: STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_SAVE,
    getUsers,
    saveUsers,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
    getUserSave,
    setUserSave,
    getUserSettings,
    setUserSettings,
    ensureUserData,
    buildDefaultSave,
    buildDefaultSettings,
    getUserBundle,
    cloneValue,
    normalizeSaveData,
    normalizeSettings
  };
})(window);
