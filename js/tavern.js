/* 역할: 주점의 실시간 모집 명단 생성, 5시간 교체, 모험가 등급과 영입 처리를 담당한다. */

(function attachTavernService(global) {
  const StorageService = global.StorageService;
  const InventoryService = global.InventoryService;
  const SkillsService = global.SkillsService;

  const REFRESH_INTERVAL_MS = 5 * 60 * 60 * 1000;
  const LINEUP_SIZE = 5;

  const GUILD_RANK_META = {
    D: {
      label: "D",
      title: "수습 모험가",
      cardRarity: "common",
      cost: 120,
      minLevel: 1,
      maxLevel: 1,
      passiveSkills: 0,
      activeSkills: 0,
      partySlots: 1,
      classPool: ["검사", "브리건드", "헌터", "솔저"],
      bonusStats: {}
    },
    C: {
      label: "C",
      title: "현장 모험가",
      cardRarity: "uncommon",
      cost: 180,
      minLevel: 1,
      maxLevel: 2,
      passiveSkills: 1,
      activeSkills: 0,
      partySlots: 1,
      classPool: ["검사", "브리건드", "헌터", "솔저", "랜서", "아처"],
      bonusStats: { maxHp: 1 }
    },
    B: {
      label: "B",
      title: "정예 모험가",
      cardRarity: "rare",
      cost: 280,
      minLevel: 2,
      maxLevel: 3,
      passiveSkills: 1,
      activeSkills: 1,
      partySlots: 2,
      classPool: ["검사", "브리건드", "헌터", "솔저", "랜서", "아처"],
      bonusStats: { maxHp: 1, str: 1, skl: 1 }
    },
    A: {
      label: "A",
      title: "베테랑 모험가",
      cardRarity: "unique",
      cost: 430,
      minLevel: 3,
      maxLevel: 4,
      passiveSkills: 2,
      activeSkills: 1,
      partySlots: 3,
      classPool: ["로드", "랜서", "아처", "검사", "브리건드", "헌터", "솔저"],
      bonusStats: { maxHp: 2, str: 1, skl: 1, spd: 1, def: 1 }
    },
    S: {
      label: "S",
      title: "길드 간판 모험가",
      cardRarity: "legendary",
      cost: 680,
      minLevel: 4,
      maxLevel: 5,
      passiveSkills: 2,
      activeSkills: 2,
      partySlots: 4,
      classPool: ["로드", "랜서", "아처", "하이로드", "팔라딘", "스나이퍼"],
      bonusStats: { maxHp: 3, str: 2, skl: 2, spd: 1, def: 1 }
    },
    "S+": {
      label: "S+",
      title: "전설급 모험가",
      cardRarity: "epic",
      cost: 980,
      minLevel: 5,
      maxLevel: 6,
      passiveSkills: 3,
      activeSkills: 2,
      partySlots: 5,
      classPool: ["하이로드", "팔라딘", "스나이퍼"],
      bonusStats: { maxHp: 4, str: 2, skl: 2, spd: 2, def: 2, mov: 1 }
    }
  };

  const RANK_WEIGHT_TABLE = [
    { rank: "D", weight: 24 },
    { rank: "C", weight: 30 },
    { rank: "B", weight: 24 },
    { rank: "A", weight: 14 },
    { rank: "S", weight: 6 },
    { rank: "S+", weight: 2 }
  ];

  const CLASS_ARCHETYPES = {
    로드: {
      weaponType: "sword",
      baseStats: { maxHp: 18, str: 6, skl: 7, spd: 8, def: 4, mov: 5 },
      namePool: ["카일", "에린", "루안", "세인"]
    },
    하이로드: {
      weaponType: "sword",
      baseStats: { maxHp: 21, str: 8, skl: 8, spd: 8, def: 6, mov: 6 },
      namePool: ["알렌", "시온", "에델", "르네"]
    },
    랜서: {
      weaponType: "lance",
      baseStats: { maxHp: 20, str: 7, skl: 5, spd: 6, def: 6, mov: 4 },
      namePool: ["브람", "린아", "테오", "세린"]
    },
    팔라딘: {
      weaponType: "lance",
      baseStats: { maxHp: 23, str: 8, skl: 6, spd: 7, def: 8, mov: 5 },
      namePool: ["드웨인", "마엘", "리트", "칼리아"]
    },
    아처: {
      weaponType: "bow",
      baseStats: { maxHp: 16, str: 5, skl: 8, spd: 7, def: 3, mov: 5 },
      namePool: ["리아나", "하엘", "유라", "케인"]
    },
    스나이퍼: {
      weaponType: "bow",
      baseStats: { maxHp: 18, str: 7, skl: 10, spd: 8, def: 4, mov: 5 },
      namePool: ["테슬", "미르", "이벨", "카란"]
    },
    검사: {
      weaponType: "sword",
      baseStats: { maxHp: 17, str: 6, skl: 6, spd: 7, def: 3, mov: 5 },
      namePool: ["유진", "라프", "나린", "델로"]
    },
    브리건드: {
      weaponType: "axe",
      baseStats: { maxHp: 19, str: 8, skl: 4, spd: 5, def: 4, mov: 4 },
      namePool: ["가론", "브릭", "네로", "하즈"]
    },
    헌터: {
      weaponType: "bow",
      baseStats: { maxHp: 17, str: 5, skl: 7, spd: 6, def: 3, mov: 5 },
      namePool: ["세아", "리브", "레온", "타니"]
    },
    솔저: {
      weaponType: "lance",
      baseStats: { maxHp: 18, str: 6, skl: 5, spd: 5, def: 5, mov: 4 },
      namePool: ["로건", "다엘", "베카", "소린"]
    }
  };

  const WEAPON_PROFILE_BY_TYPE = {
    sword: { name: "길드 장검", might: 5, hit: 88, rangeMin: 1, rangeMax: 1, uses: 40 },
    lance: { name: "길드 장창", might: 6, hit: 82, rangeMin: 1, rangeMax: 1, uses: 38 },
    bow: { name: "길드 장궁", might: 5, hit: 90, rangeMin: 2, rangeMax: 2, uses: 34 },
    axe: { name: "길드 전투도끼", might: 7, hit: 76, rangeMin: 1, rangeMax: 1, uses: 36 }
  };

  const PASSIVE_SKILL_POOL = {
    sword: ["warlord_presence", "fortress_heart"],
    lance: ["fortress_heart", "warlord_presence"],
    bow: ["eagle_commander", "warlord_presence"],
    axe: ["warlord_presence", "fortress_heart"]
  };

  const ACTIVE_SKILL_POOL = {
    sword: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    lance: ["guard_roar", "adamant_guard", "boss_cleave"],
    bow: ["rain_of_arrows", "marked_shot", "adamant_guard"],
    axe: ["frenzy_assault", "boss_cleave", "adamant_guard"]
  };

  function clone(value) {
    return StorageService.cloneValue(value);
  }

  function getRefreshBlock(now) {
    return Math.floor((now || Date.now()) / REFRESH_INTERVAL_MS);
  }

  function getRefreshWindowStart(block) {
    return block * REFRESH_INTERVAL_MS;
  }

  function getNextRefreshTimestamp(block) {
    return getRefreshWindowStart(block + 1);
  }

  function ensureTavernShape(saveData) {
    saveData.tavern = Object.assign({
      refreshBlock: null,
      lastRefreshAt: null,
      nextRefreshAt: null,
      lineup: []
    }, clone(saveData.tavern || {}));
    saveData.tavern.lineup = clone(saveData.tavern.lineup || []);
    return saveData.tavern;
  }

  function pickWeightedRank() {
    const totalWeight = RANK_WEIGHT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < RANK_WEIGHT_TABLE.length; index += 1) {
      roll -= RANK_WEIGHT_TABLE[index].weight;
      if (roll <= 0) {
        return RANK_WEIGHT_TABLE[index].rank;
      }
    }

    return "D";
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    const source = list.slice();

    for (let index = source.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const temp = source[index];
      source[index] = source[swapIndex];
      source[swapIndex] = temp;
    }

    return source;
  }

  function applyBonusStats(unit, bonusStats) {
    Object.keys(bonusStats || {}).forEach((statName) => {
      unit[statName] = (unit[statName] || 0) + (bonusStats[statName] || 0);

      if (statName === "maxHp") {
        unit.hp = unit.maxHp;
      }
    });
  }

  function buildWeapon(type, unitId, rank) {
    const rankMeta = GUILD_RANK_META[rank] || GUILD_RANK_META.D;
    const base = Object.assign({}, WEAPON_PROFILE_BY_TYPE[type] || WEAPON_PROFILE_BY_TYPE.sword);

    return {
      id: `guild-weapon-${unitId}`,
      name: base.name,
      type,
      slot: "weapon",
      might: base.might + (rank === "S+" ? 3 : rank === "S" ? 2 : rank === "A" ? 1 : 0),
      hit: base.hit + (rank === "S+" ? 6 : rank === "S" ? 4 : rank === "A" ? 2 : 0),
      rangeMin: base.rangeMin,
      rangeMax: base.rangeMax,
      uses: base.uses,
      rarity: rankMeta.cardRarity,
      equippedBy: unitId
    };
  }

  function pickUniqueSkillIds(pool, count) {
    return shuffle(pool || []).slice(0, Math.min(count, (pool || []).length));
  }

  function buildAdventurerCandidate(block, slotIndex) {
    const rank = pickWeightedRank();
    const rankMeta = GUILD_RANK_META[rank];
    const className = pickRandom(rankMeta.classPool);
    const archetype = CLASS_ARCHETYPES[className] || CLASS_ARCHETYPES.검사;
    const level = rankMeta.minLevel + Math.floor(Math.random() * (rankMeta.maxLevel - rankMeta.minLevel + 1));
    const unitId = `tavern-${block}-${slotIndex}-${Math.floor(Math.random() * 100000)}`;
    const unit = {
      id: unitId,
      name: pickRandom(archetype.namePool),
      team: "ally",
      className,
      level: 1,
      exp: 0,
      hp: archetype.baseStats.maxHp,
      maxHp: archetype.baseStats.maxHp,
      str: archetype.baseStats.str,
      skl: archetype.baseStats.skl,
      spd: archetype.baseStats.spd,
      def: archetype.baseStats.def,
      mov: archetype.baseStats.mov,
      x: 0,
      y: 0,
      acted: false,
      alive: true,
      weapon: null,
      guildRank: rank,
      statPoints: Math.max(0, rankMeta.partySlots - 1),
      equippedItemIds: [],
      specialSkillIds: [],
      specialActiveSkillIds: [],
      recruitSource: "tavern",
      hiredAt: null
    };

    for (let currentLevel = 2; currentLevel <= level; currentLevel += 1) {
      SkillsService.applyLevelGains(unit, SkillsService.rollLevelGains(unit));
      unit.level = currentLevel;
    }

    applyBonusStats(unit, rankMeta.bonusStats);
    unit.hp = unit.maxHp;
    unit.specialSkillIds = pickUniqueSkillIds(PASSIVE_SKILL_POOL[archetype.weaponType], rankMeta.passiveSkills);
    unit.specialActiveSkillIds = pickUniqueSkillIds(ACTIVE_SKILL_POOL[archetype.weaponType], rankMeta.activeSkills);

    return {
      id: unitId,
      unit,
      guildRank: rank,
      hireCost: rankMeta.cost,
      rarity: rankMeta.cardRarity,
      rankTitle: rankMeta.title,
      refreshBlock: block,
      recruitedAt: null,
      startingWeapon: buildWeapon(archetype.weaponType, unitId, rank)
    };
  }

  function refreshLineup(saveData) {
    const tavern = ensureTavernShape(saveData);
    const block = getRefreshBlock();

    tavern.refreshBlock = block;
    tavern.lastRefreshAt = new Date().toISOString();
    tavern.nextRefreshAt = new Date(getNextRefreshTimestamp(block)).toISOString();
    tavern.lineup = Array.from({ length: LINEUP_SIZE }, (_, index) => buildAdventurerCandidate(block, index));
    return tavern;
  }

  function syncTavern(saveData) {
    const tavern = ensureTavernShape(saveData);
    const block = getRefreshBlock();
    const needsRefresh = tavern.refreshBlock !== block || !tavern.lineup.length;

    if (needsRefresh) {
      refreshLineup(saveData);
    } else {
      tavern.nextRefreshAt = tavern.nextRefreshAt || new Date(getNextRefreshTimestamp(block)).toISOString();
    }

    return {
      changed: needsRefresh,
      tavern: saveData.tavern
    };
  }

  function recruitAdventurer(saveData, adventurerId) {
    const tavern = ensureTavernShape(saveData);
    const candidate = (tavern.lineup || []).find((entry) => entry.id === adventurerId);

    if (!candidate) {
      throw new Error("해당 모험가는 이미 떠났거나 존재하지 않습니다.");
    }

    if (candidate.recruitedAt) {
      throw new Error("이미 영입한 모험가입니다.");
    }

    if ((saveData.partyGold || 0) < (candidate.hireCost || 0)) {
      throw new Error("골드가 부족합니다.");
    }

    const unit = clone(candidate.unit);
    const weapon = clone(candidate.startingWeapon);

    saveData.partyGold -= candidate.hireCost || 0;
    unit.hiredAt = new Date().toISOString();
    unit.weapon = weapon.id;
    unit.equippedItemIds = [weapon.id];
    weapon.equippedBy = unit.id;
    saveData.roster = saveData.roster || [];
    saveData.inventory = saveData.inventory || [];
    saveData.roster.push(unit);
    InventoryService.addItemToInventory(saveData, weapon);

    if ((saveData.selectedPartyIds || []).length < 3) {
      saveData.selectedPartyIds.push(unit.id);
    }

    candidate.recruitedAt = unit.hiredAt;
    return {
      unit,
      weapon,
      candidate
    };
  }

  function setLeader(saveData, unitId) {
    const unit = (saveData.roster || []).find((entry) => entry.id === unitId);

    if (!unit) {
      throw new Error("리더로 지정할 유닛을 찾을 수 없습니다.");
    }

    saveData.leaderUnitId = unitId;
    return unit;
  }

  function getRankMeta(rank) {
    return GUILD_RANK_META[rank] || GUILD_RANK_META.D;
  }

  global.TavernService = {
    REFRESH_INTERVAL_MS,
    GUILD_RANK_META,
    syncTavern,
    recruitAdventurer,
    setLeader,
    getRankMeta
  };
})(window);
