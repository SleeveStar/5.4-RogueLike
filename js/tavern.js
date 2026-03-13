/* 역할: 주점의 실시간 모집 명단 생성, 5시간 교체, 모험가 등급과 영입 처리를 담당한다. */

(function attachTavernService(global) {
  const StorageService = global.StorageService;
  const InventoryService = global.InventoryService;
  const StatsService = global.StatsService;
  const SkillsService = global.SkillsService;

  const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
  const LINEUP_SIZE = 4;
  const MAX_SORTIE_SIZE = 5;
  const DAILY_MANUAL_REFRESH_LIMIT = 5;
  const PAID_MANUAL_REFRESH_COST = 2000;

  const GUILD_RANK_META = {
    D: {
      label: "D",
      title: "수습 모험가",
      cardRarity: "common",
      cost: 450,
      minLevel: 1,
      maxLevel: 1,
      passiveSkills: 0,
      activeSkills: 0,
      signaturePassiveChance: 0.03,
      partySlots: 1,
      classPool: ["검사", "브리건드", "헌터", "솔저", "클레릭", "메이지"],
      bonusStats: {}
    },
    C: {
      label: "C",
      title: "현장 모험가",
      cardRarity: "uncommon",
      cost: 700,
      minLevel: 1,
      maxLevel: 2,
      passiveSkills: 1,
      activeSkills: 0,
      signaturePassiveChance: 0.07,
      partySlots: 1,
      classPool: ["검사", "브리건드", "헌터", "솔저", "랜서", "아처", "클레릭", "메이지"],
      bonusStats: { maxHp: 1 }
    },
    B: {
      label: "B",
      title: "정예 모험가",
      cardRarity: "rare",
      cost: 1200,
      minLevel: 2,
      maxLevel: 3,
      passiveSkills: 1,
      activeSkills: 1,
      signaturePassiveChance: 0.16,
      partySlots: 2,
      classPool: ["검사", "브리건드", "헌터", "솔저", "랜서", "아처", "클레릭", "메이지"],
      bonusStats: { maxHp: 1, str: 1, skl: 1 }
    },
    A: {
      label: "A",
      title: "베테랑 모험가",
      cardRarity: "unique",
      cost: 2200,
      minLevel: 3,
      maxLevel: 4,
      passiveSkills: 2,
      activeSkills: 1,
      signaturePassiveChance: 0.32,
      partySlots: 3,
      classPool: ["로드", "랜서", "아처", "검사", "브리건드", "헌터", "솔저", "클레릭", "메이지"],
      bonusStats: { maxHp: 2, str: 1, skl: 1, spd: 1, def: 1 }
    },
    S: {
      label: "S",
      title: "길드 간판 모험가",
      cardRarity: "legendary",
      cost: 3800,
      minLevel: 4,
      maxLevel: 5,
      passiveSkills: 2,
      activeSkills: 2,
      signaturePassiveChance: 0.58,
      partySlots: 4,
      classPool: ["로드", "랜서", "아처", "하이로드", "팔라딘", "스나이퍼", "클레릭", "비숍", "위저드", "소서러"],
      bonusStats: { maxHp: 3, str: 2, skl: 2, spd: 1, def: 1 }
    },
    SS: {
      label: "SS",
      title: "영웅급 모험가",
      cardRarity: "epic",
      cost: 6200,
      minLevel: 5,
      maxLevel: 6,
      passiveSkills: 3,
      activeSkills: 2,
      signaturePassiveChance: 0.84,
      partySlots: 5,
      classPool: ["하이로드", "팔라딘", "스나이퍼", "비숍", "위저드", "소서러"],
      bonusStats: { maxHp: 4, str: 2, skl: 2, spd: 2, def: 2, mov: 1 }
    },
    SSS: {
      label: "SSS",
      title: "천외천 모험가",
      cardRarity: "primordial",
      cost: 9800,
      minLevel: 6,
      maxLevel: 8,
      passiveSkills: 4,
      activeSkills: 3,
      signaturePassiveChance: 0.97,
      partySlots: 5,
      classPool: ["하이로드", "팔라딘", "스나이퍼", "비숍", "위저드", "소서러"],
      bonusStats: { maxHp: 6, str: 3, skl: 3, spd: 3, def: 3, mov: 1 }
    }
  };
  const GUILD_RANK_ORDER = ["D", "C", "B", "A", "S", "SS", "SSS"];

  const RANK_WEIGHT_TABLE = [
    { rank: "D", weight: 24 },
    { rank: "C", weight: 30 },
    { rank: "B", weight: 24 },
    { rank: "A", weight: 14 },
    { rank: "S", weight: 6 },
    { rank: "SS", weight: 2 },
    { rank: "SSS", weight: 1 }
  ];
  const POTENTIAL_ROLL_META = {
    D: { min: 14, max: 38, jackpotChance: 0.08, jackpotMin: 72, jackpotMax: 97 },
    C: { min: 18, max: 46, jackpotChance: 0.07, jackpotMin: 70, jackpotMax: 96 },
    B: { min: 32, max: 62, jackpotChance: 0.05, jackpotMin: 74, jackpotMax: 98 },
    A: { min: 48, max: 78, jackpotChance: 0.06, jackpotMin: 82, jackpotMax: 99 },
    S: { min: 64, max: 90, jackpotChance: 0.08, jackpotMin: 88, jackpotMax: 100 },
    SS: { min: 78, max: 96, jackpotChance: 0.12, jackpotMin: 92, jackpotMax: 100 },
    SSS: { min: 90, max: 100, jackpotChance: 0.4, jackpotMin: 96, jackpotMax: 100 }
  };
  const RANK_PROMOTION_REQUIREMENTS = {
    D: { nextRank: "C", minLevel: 12, minTrainingLevel: 1, cost: 300, rewardStatPoints: 1, rewardSkillPoints: 0, rewardGrowthPoints: 2 },
    C: { nextRank: "B", minLevel: 20, minTrainingLevel: 2, cost: 650, rewardStatPoints: 1, rewardSkillPoints: 1, rewardGrowthPoints: 3 },
    B: { nextRank: "A", minLevel: 35, minTrainingLevel: 3, cost: 1200, rewardStatPoints: 2, rewardSkillPoints: 1, rewardGrowthPoints: 4 },
    A: { nextRank: "S", minLevel: 55, minTrainingLevel: 4, cost: 2400, rewardStatPoints: 2, rewardSkillPoints: 2, rewardGrowthPoints: 4 },
    S: { nextRank: "SS", minLevel: 80, minTrainingLevel: 5, cost: 4800, rewardStatPoints: 3, rewardSkillPoints: 2, rewardGrowthPoints: 5 },
    SS: { nextRank: "SSS", minLevel: 99, minTrainingLevel: 6, cost: 9600, rewardStatPoints: 4, rewardSkillPoints: 3, rewardGrowthPoints: 6 }
  };
  const SSS_NAME_POOL = ["다원", "승일", "대호", "문성", "지훈", "승인", "승민", "형록", "희주", "민경", "애라", "메이", "후우카"];

  const CLASS_ARCHETYPES = {
    로드: {
      weaponType: "sword",
      baseStats: { maxHp: 18, str: 6, skl: 7, spd: 8, def: 4, mov: 4 },
      namePool: ["카이란", "에드릭", "루시안", "세드릭", "레오릭", "알드렌", "테오란", "바렌", "로웬", "다미르"]
    },
    하이로드: {
      weaponType: "sword",
      baseStats: { maxHp: 21, str: 8, skl: 8, spd: 8, def: 6, mov: 5 },
      namePool: ["알레리온", "시그런", "에델란", "르시엘", "이사르", "아벨론", "로엔", "테오도르", "마르칸", "벨리안"]
    },
    클레릭: {
      weaponType: "focus",
      baseStats: { maxHp: 15, str: 3, skl: 7, spd: 6, def: 3, mov: 4 },
      namePool: ["엘리엔", "마리엘", "요안나", "세라핀", "리오네", "유리에", "시아나", "에벨린", "라티아", "지젤라"]
    },
    비숍: {
      weaponType: "focus",
      baseStats: { maxHp: 18, str: 4, skl: 9, spd: 7, def: 4, mov: 4 },
      namePool: ["루시아르", "에스텔라", "라오나", "미카엘라", "세리엔", "아리엘", "엘리아나", "소렐", "다에린", "주벨"]
    },
    메이지: {
      weaponType: "staff",
      baseStats: { maxHp: 14, str: 3, skl: 9, spd: 6, def: 2, mov: 4 },
      namePool: ["리안델", "시아르", "유엘린", "노에른", "다이란", "세오른", "하라스", "윤셀", "라에르", "타린"]
    },
    위저드: {
      weaponType: "staff",
      baseStats: { maxHp: 16, str: 4, skl: 11, spd: 7, def: 3, mov: 4 },
      namePool: ["아린델", "테아노", "에리온", "다오르", "예르딘", "로아르", "지하르", "유헨", "도안", "시리온"]
    },
    소서러: {
      weaponType: "staff",
      baseStats: { maxHp: 15, str: 4, skl: 10, spd: 8, def: 2, mov: 4 },
      namePool: ["세오른", "리브라", "카엘룸", "하린느", "미네라", "레이나", "도리안", "세헤라", "타이론", "루하나"]
    },
    랜서: {
      weaponType: "lance",
      baseStats: { maxHp: 20, str: 7, skl: 5, spd: 6, def: 6, mov: 4 },
      namePool: ["브람", "리나르", "테오", "세린", "리온", "체이서", "수헬", "미넥", "준벨", "하율렌"]
    },
    팔라딘: {
      weaponType: "lance",
      baseStats: { maxHp: 23, str: 8, skl: 6, spd: 7, def: 8, mov: 5 },
      namePool: ["드웨인", "마엘", "리트", "칼리아", "헨릭", "테온", "타르건", "세르린", "시엘", "가르람"]
    },
    아처: {
      weaponType: "bow",
      baseStats: { maxHp: 16, str: 5, skl: 8, spd: 7, def: 3, mov: 4 },
      namePool: ["리아나", "하엘", "유라", "케인", "세율", "하이넬", "지율렌", "미르재", "로웬", "시아"]
    },
    스나이퍼: {
      weaponType: "bow",
      baseStats: { maxHp: 18, str: 7, skl: 10, spd: 8, def: 4, mov: 4 },
      namePool: ["테슬", "미르", "이벨", "카란", "쟈후르", "도겜", "아린델", "세은느", "이든", "타민"]
    },
    검사: {
      weaponType: "sword",
      baseStats: { maxHp: 17, str: 6, skl: 6, spd: 7, def: 3, mov: 4 },
      namePool: ["유진느", "라프", "나린", "델로", "가윈", "스노우", "재민느", "시후르", "지세르", "하온"]
    },
    브리건드: {
      weaponType: "axe",
      baseStats: { maxHp: 19, str: 8, skl: 4, spd: 5, def: 4, mov: 3 },
      namePool: ["가론", "브릭", "네로", "하즈", "도하르", "타산", "타르시", "세온드", "베이룬", "헨빈"]
    },
    헌터: {
      weaponType: "bow",
      baseStats: { maxHp: 17, str: 5, skl: 7, spd: 6, def: 3, mov: 5 },
      namePool: ["세아라", "리브", "레온", "타니아", "헤수스", "수엘", "지수엘", "키호른", "시온", "도제"]
    },
    솔저: {
      weaponType: "lance",
      baseStats: { maxHp: 18, str: 6, skl: 5, spd: 5, def: 5, mov: 4 },
      namePool: ["로건", "다엘", "베카", "소린", "미니오", "타영", "쥬느", "도펠드", "세누", "설르닐"]
    }
  };

  const WEAPON_PROFILE_BY_TYPE = {
    sword: { name: "길드 장검", might: 5, hit: 88, rangeMin: 1, rangeMax: 1, uses: 40 },
    greatsword: { name: "길드 대검", might: 8, hit: 78, rangeMin: 1, rangeMax: 1, uses: 32 },
    tachi: { name: "길드 태도", might: 6, hit: 90, rangeMin: 1, rangeMax: 1, uses: 35 },
    katana: { name: "길드 카타나", might: 6, hit: 92, rangeMin: 1, rangeMax: 1, uses: 33 },
    hwando: { name: "길드 환도", might: 7, hit: 86, rangeMin: 1, rangeMax: 1, uses: 36 },
    lance: { name: "길드 장창", might: 6, hit: 82, rangeMin: 1, rangeMax: 1, uses: 38 },
    spear: { name: "길드 장창", might: 6, hit: 84, rangeMin: 1, rangeMax: 1, uses: 36 },
    halberd: { name: "길드 할버드", might: 8, hit: 78, rangeMin: 1, rangeMax: 1, uses: 30 },
    bow: { name: "길드 장궁", might: 5, hit: 90, rangeMin: 2, rangeMax: 2, uses: 34 },
    shortbow: { name: "길드 단궁", might: 4, hit: 94, rangeMin: 2, rangeMax: 2, uses: 34 },
    longbow: { name: "길드 장궁", might: 6, hit: 86, rangeMin: 2, rangeMax: 3, uses: 28 },
    crossbow: { name: "길드 석궁", might: 7, hit: 82, rangeMin: 2, rangeMax: 2, uses: 30 },
    axe: { name: "길드 전투도끼", might: 7, hit: 76, rangeMin: 1, rangeMax: 1, uses: 36 },
    handaxe: { name: "길드 손도끼", might: 6, hit: 80, rangeMin: 1, rangeMax: 2, uses: 30 },
    battleaxe: { name: "길드 전투도끼", might: 8, hit: 76, rangeMin: 1, rangeMax: 1, uses: 32 },
    greataxe: { name: "길드 대도끼", might: 10, hit: 70, rangeMin: 1, rangeMax: 1, uses: 26 },
    focus: { name: "길드 성구", might: 4, hit: 92, rangeMin: 1, rangeMax: 2, uses: 34 },
    staff: { name: "길드 마도지팡이", might: 5, hit: 90, rangeMin: 1, rangeMax: 3, uses: 30 },
    wand: { name: "길드 완드", might: 4, hit: 94, rangeMin: 1, rangeMax: 2, uses: 34 },
    tome: { name: "길드 고서", might: 5, hit: 88, rangeMin: 1, rangeMax: 2, uses: 32 },
    grimoire: { name: "길드 마도서", might: 6, hit: 86, rangeMin: 1, rangeMax: 3, uses: 28 }
  };

  const PASSIVE_SKILL_POOL = {
    sword: ["warlord_presence", "fortress_heart"],
    greatsword: ["warlord_presence", "fortress_heart"],
    tachi: ["warlord_presence", "fortress_heart"],
    katana: ["warlord_presence", "fortress_heart"],
    hwando: ["warlord_presence", "fortress_heart"],
    lance: ["fortress_heart", "warlord_presence"],
    spear: ["fortress_heart", "warlord_presence"],
    halberd: ["fortress_heart", "warlord_presence"],
    bow: ["eagle_commander", "warlord_presence"],
    shortbow: ["eagle_commander", "warlord_presence"],
    longbow: ["eagle_commander", "warlord_presence"],
    crossbow: ["eagle_commander", "warlord_presence"],
    axe: ["warlord_presence", "fortress_heart"],
    handaxe: ["warlord_presence", "fortress_heart"],
    battleaxe: ["warlord_presence", "fortress_heart"],
    greataxe: ["warlord_presence", "fortress_heart"],
    focus: ["saint_guard", "oracle_insight", "mystic_barrier"],
    staff: ["mana_well", "spell_overflow", "mystic_barrier"],
    wand: ["mana_well", "spell_overflow", "mystic_barrier"],
    tome: ["mana_well", "spell_overflow", "mystic_barrier"],
    grimoire: ["mana_well", "spell_overflow", "mystic_barrier"]
  };

  const ACTIVE_SKILL_POOL = {
    sword: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    greatsword: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    tachi: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    katana: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    hwando: ["boss_cleave", "frenzy_assault", "adamant_guard"],
    lance: ["guard_roar", "adamant_guard", "boss_cleave"],
    spear: ["guard_roar", "adamant_guard", "boss_cleave"],
    halberd: ["guard_roar", "adamant_guard", "boss_cleave"],
    bow: ["rain_of_arrows", "marked_shot", "adamant_guard"],
    shortbow: ["rain_of_arrows", "marked_shot", "adamant_guard"],
    longbow: ["rain_of_arrows", "marked_shot", "adamant_guard"],
    crossbow: ["rain_of_arrows", "marked_shot", "adamant_guard"],
    axe: ["frenzy_assault", "boss_cleave", "adamant_guard"],
    handaxe: ["frenzy_assault", "boss_cleave", "adamant_guard"],
    battleaxe: ["frenzy_assault", "boss_cleave", "adamant_guard"],
    greataxe: ["frenzy_assault", "boss_cleave", "adamant_guard"],
    focus: ["sanctuary_wave", "oracle_ray", "holy_lance"],
    staff: ["arcane_orb", "nova_burst", "ether_spear"],
    wand: ["arcane_orb", "nova_burst", "ether_spear"],
    tome: ["arcane_orb", "nova_burst", "ether_spear"],
    grimoire: ["arcane_orb", "nova_burst", "ether_spear"]
  };

  const STARTING_WEAPON_VARIANTS = {
    sword: ["sword", "greatsword", "tachi", "katana", "hwando"],
    lance: ["lance", "spear", "halberd", "hwando"],
    axe: ["axe", "handaxe", "battleaxe", "greataxe", "greatsword"],
    bow: ["bow", "shortbow", "longbow", "crossbow"],
    focus: ["focus", "tome"],
    staff: ["staff", "wand", "tome", "grimoire"]
  };

  const SIGNATURE_PASSIVE_POOL_BY_CLASS = {
    로드: ["sovereign_drive", "warlord_presence", "vanguard", "royal_drive", "highland_command", "regal_aura", "guardian_command"],
    하이로드: ["sovereign_drive", "imperial_banner", "regal_aura", "guardian_command", "crown_highground", "vanguard", "royal_drive", "highland_command"],
    블레이드로드: ["blade_discipline", "sovereign_drive"],
    검사: ["blade_discipline", "vanguard", "warlord_presence", "fortress_heart", "royal_drive", "duel_focus", "woodland_step"],
    소드마스터: ["blade_discipline"],
    엠퍼러: ["imperial_banner", "sovereign_drive"],
    검성: ["blade_discipline", "sovereign_drive"],
    오버로드: ["imperial_banner", "warlord_presence"],
    스타블레이드: ["blade_discipline", "nightmare_trail"],
    랜서: ["guardian_oath", "brace", "steady_point", "ridge_guard", "fortress_heart", "holy_charge", "steady_guard"],
    팔라딘: ["guardian_oath", "holy_charge", "fortress_charge", "steady_guard", "plateau_lancer", "brace", "ridge_guard", "aegis_core"],
    가디언: ["guardian_oath", "aegis_core"],
    센티넬: ["guardian_oath", "aegis_core"],
    홀리랜서: ["holy_charge", "guardian_oath"],
    포트리스: ["aegis_core", "guardian_oath"],
    아크랜서: ["holy_charge", "aegis_core"],
    이지스로드: ["aegis_core", "guardian_oath"],
    아처: ["ranger_instinct", "eagle_eye", "finish_shot", "ridge_archery", "eagle_commander", "deadeye", "elevated_scope"],
    스나이퍼: ["ranger_instinct", "celestial_scope", "deadeye", "piercing_focus", "elevated_scope", "eagle_eye", "finish_shot"],
    레인저: ["ranger_instinct", "celestial_scope"],
    호크아이: ["celestial_scope", "ranger_instinct"],
    천궁성: ["celestial_scope", "ranger_instinct"],
    헌터: ["trap_sense", "lurking_shot", "canopy_veil", "ranger_instinct", "nightmare_trail", "eagle_eye", "finish_shot"],
    트래퍼: ["trap_sense", "nightmare_trail"],
    그림트래퍼: ["trap_sense", "nightmare_trail"],
    나이트메어헌트: ["nightmare_trail", "trap_sense"],
    브리건드: ["berserk_blood", "savage_blow", "cliff_raider", "doom_mark", "fortress_heart", "warlord_presence", "steady_guard"],
    버서커: ["berserk_blood", "doom_mark"],
    워브레이커: ["berserk_blood", "doom_mark"],
    데스브링어: ["doom_mark", "berserk_blood"],
    월드이터: ["doom_mark", "berserk_blood"],
    클레릭: ["saint_guard", "sacred_bulwark", "blessed_guidance", "oracle_insight", "mystic_barrier", "sanctuary_aura", "divine_focus"],
    비숍: ["saint_guard", "oracle_insight", "sanctuary_aura", "judgment_light", "divine_focus", "sacred_bulwark", "blessed_guidance"],
    메이지: ["mana_well", "mystic_barrier", "spellcraft", "mana_skin", "oracle_insight", "spell_echo", "arcane_flow"],
    위저드: ["mana_well", "spell_overflow", "spell_echo", "arcane_flow", "mystic_barrier", "spellcraft", "oracle_insight"],
    소서러: ["spell_overflow", "mystic_barrier", "abyss_focus", "hex_sight", "mana_well", "spellcraft", "arcane_flow"],
    솔저: ["shield_wall", "stonefoot", "guardian_oath", "fortress_heart", "steady_guard", "brace", "ridge_guard"],
    오라클: ["oracle_insight", "saint_guard"],
    세라핌: ["saint_guard"],
    인퀴지터: ["oracle_insight", "saint_guard"],
    성녀: ["saint_guard"],
    아크저지: ["oracle_insight", "saint_guard"],
    아크메이지: ["mana_well", "mystic_barrier"],
    워록: ["spell_overflow", "mystic_barrier"],
    대현자: ["mana_well", "spell_overflow"],
    보이드로드: ["spell_overflow", "mystic_barrier"]
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

  function getLocalDateKey(dateValue) {
    const currentDate = dateValue ? new Date(dateValue) : new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getNextDailyResetTimestamp() {
    const nextReset = new Date();
    nextReset.setHours(24, 0, 0, 0);
    return nextReset.getTime();
  }

  function ensureTavernShape(saveData) {
    saveData.tavern = Object.assign({
      refreshBlock: null,
      lastRefreshAt: null,
      nextRefreshAt: null,
      lineup: [],
      manualRefreshDate: null,
      manualRefreshUsed: 0
    }, clone(saveData.tavern || {}));
    saveData.tavern.lineup = clone(saveData.tavern.lineup || []);
    saveData.tavern.manualRefreshDate = saveData.tavern.manualRefreshDate || getLocalDateKey();
    saveData.tavern.manualRefreshUsed = Math.max(0, Math.floor(Number(saveData.tavern.manualRefreshUsed || 0)));

    if (saveData.tavern.manualRefreshDate !== getLocalDateKey()) {
      saveData.tavern.manualRefreshDate = getLocalDateKey();
      saveData.tavern.manualRefreshUsed = 0;
    }

    return saveData.tavern;
  }

  function pickWeightedRank(options) {
    const nextOptions = options || {};
    const rankPool = RANK_WEIGHT_TABLE.filter((entry) => (
      nextOptions.allowSSS !== false || entry.rank !== "SSS"
    ));
    const totalWeight = rankPool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < rankPool.length; index += 1) {
      roll -= rankPool[index].weight;
      if (roll <= 0) {
        return rankPool[index].rank;
      }
    }

    return "D";
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (Math.max(0, max - min) + 1));
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

  function getUnavailableSSSNames(saveData, reservedNames) {
    const usedNames = new Set();

    ((saveData && saveData.roster) || []).forEach((unit) => {
      if (unit && unit.guildRank === "SSS" && unit.name) {
        usedNames.add(String(unit.name));
      }
    });

    (((saveData && saveData.tavern && saveData.tavern.lineup) || [])).forEach((candidate) => {
      const unit = candidate && candidate.unit;

      if (unit && candidate.guildRank === "SSS" && unit.name) {
        usedNames.add(String(unit.name));
      }
    });

    (reservedNames || []).forEach((name) => {
      if (name) {
        usedNames.add(String(name));
      }
    });

    return usedNames;
  }

  function getAvailableSSSNames(saveData, reservedNames) {
    const unavailableNames = getUnavailableSSSNames(saveData, reservedNames);
    return SSS_NAME_POOL.filter((name) => !unavailableNames.has(name));
  }

  function applyBonusStats(unit, bonusStats) {
    Object.keys(bonusStats || {}).forEach((statName) => {
      unit[statName] = (unit[statName] || 0) + (bonusStats[statName] || 0);

      if (statName === "maxHp") {
        unit.hp = unit.maxHp;
      }
    });
  }

  function buildWeapon(type, unitId, rank, level) {
    const rankMeta = GUILD_RANK_META[rank] || GUILD_RANK_META.D;
    const base = Object.assign({}, WEAPON_PROFILE_BY_TYPE[type] || WEAPON_PROFILE_BY_TYPE.sword);
    const weaponPowerBonus = rank === "SSS" ? 5 : rank === "SS" ? 4 : rank === "S" ? 2 : rank === "A" ? 1 : 0;
    const weaponHitBonus = rank === "SSS" ? 10 : rank === "SS" ? 8 : rank === "S" ? 4 : rank === "A" ? 2 : 0;
    const weapon = {
      id: `guild-weapon-${unitId}`,
      name: base.name,
      type,
      slot: "weapon",
      might: base.might + weaponPowerBonus,
      hit: base.hit + weaponHitBonus,
      rangeMin: base.rangeMin,
      rangeMax: base.rangeMax,
      uses: base.uses,
      rarity: rankMeta.cardRarity,
      equippedBy: unitId
    };

    InventoryService.finalizeGeneratedEquipment(weapon, rankMeta.cardRarity, Math.max(1, Number(level || 1)), {
      minAffixCount: 1
    });

    return weapon;
  }

  function pickStartingWeaponType(className, baseType) {
    const allowedTypes = InventoryService.getClassWeaponTypes(className);
    const preferredTypes = (STARTING_WEAPON_VARIANTS[baseType] || [baseType])
      .filter((type) => allowedTypes.includes(type));
    const pool = preferredTypes.length ? preferredTypes : allowedTypes;

    return pickRandom(pool && pool.length ? pool : [baseType || "sword"]);
  }

  function pickUniqueSkillIds(pool, count) {
    return shuffle(pool || []).slice(0, Math.min(count, (pool || []).length));
  }

  function appendUniqueSkillId(list, skillId) {
    const target = Array.isArray(list) ? list : [];

    if (skillId && !target.includes(skillId)) {
      target.push(skillId);
    }

    return target;
  }

  function getRankIndex(rank) {
    const index = GUILD_RANK_ORDER.indexOf(rank);
    return index >= 0 ? index : 0;
  }

  function getNextGuildRank(rank) {
    const currentIndex = getRankIndex(rank);
    return GUILD_RANK_ORDER[currentIndex + 1] || null;
  }

  function rollPotentialScore(rank) {
    const rollMeta = POTENTIAL_ROLL_META[rank] || POTENTIAL_ROLL_META.D;

    if (Math.random() <= Number(rollMeta.jackpotChance || 0)) {
      return randomBetween(rollMeta.jackpotMin, rollMeta.jackpotMax);
    }

    return randomBetween(rollMeta.min, rollMeta.max);
  }

  function pickSignaturePassiveIds(className, rankMeta, currentSkillIds, options) {
    const nextOptions = options || {};
    const pool = shuffle(SIGNATURE_PASSIVE_POOL_BY_CLASS[className] || [])
      .filter((skillId) => !currentSkillIds.includes(skillId));

    if (!pool.length) {
      return [];
    }

    let targetCount = 0;
    const rank = nextOptions.rank || "D";
    const potentialScore = Math.max(0, Number(nextOptions.potentialScore || 0));
    const baseChance = Number(rankMeta && rankMeta.signaturePassiveChance || 0);

    if (Math.random() <= baseChance) {
      targetCount += 1;
    }

    const bonusChance = Math.min(
      0.92,
      baseChance * 0.55
        + (rank === "D" ? 0.05 : rank === "C" ? 0.07 : rank === "B" ? 0.05 : rank === "A" ? 0.03 : 0)
        + (potentialScore >= 75 ? 0.12 : potentialScore >= 60 ? 0.06 : 0)
    );

    if (Math.random() <= bonusChance) {
      targetCount += 1;
    }

    const jackpotChance = Math.min(
      0.48,
      (rank === "D" ? 0.035 : rank === "C" ? 0.05 : rank === "B" ? 0.07 : rank === "A" ? 0.09 : rank === "S" ? 0.12 : rank === "SS" ? 0.16 : 0.22)
        + (potentialScore >= 90 ? 0.08 : 0)
    );

    if (Math.random() <= jackpotChance) {
      const jackpotRollRange = Math.min(4, Math.max(1, pool.length - 1));
      targetCount = Math.max(targetCount, 2 + Math.floor(Math.random() * jackpotRollRange));
    }

    if (rank === "SS" && targetCount <= 0) {
      targetCount = 1;
    }

    if (rank === "SSS") {
      targetCount = Math.max(2, targetCount);
    }

    return pool.slice(0, Math.min(pool.length, targetCount));
  }

  function getTrainingCost(unit) {
    const rankIndex = getRankIndex(unit && unit.guildRank || "D");
    const trainingLevel = Math.max(0, Math.floor(Number(unit && unit.trainingLevel || 0)));
    const level = Math.max(1, Math.floor(Number(unit && unit.level || 1)));
    return 140 + rankIndex * 120 + trainingLevel * 160 + level * 18;
  }

  function getRankPromotionRequirement(unit) {
    const requirement = RANK_PROMOTION_REQUIREMENTS[unit && unit.guildRank || "D"];

    if (!requirement) {
      return null;
    }

    return Object.assign({}, requirement, {
      eligible: !!unit
        && Math.max(1, Number(unit.level || 1)) >= requirement.minLevel
        && Math.max(0, Number(unit.trainingLevel || 0)) >= requirement.minTrainingLevel,
      currentRank: unit.guildRank || "D"
    });
  }

  function buildAdventurerCandidate(saveData, block, slotIndex, reservedSSSNames) {
    const availableSSSNames = getAvailableSSSNames(saveData, reservedSSSNames);
    const rank = pickWeightedRank({
      allowSSS: availableSSSNames.length > 0
    });
    const rankMeta = GUILD_RANK_META[rank];
    const className = pickRandom(rankMeta.classPool);
    const archetype = CLASS_ARCHETYPES[className] || CLASS_ARCHETYPES.검사;
    const level = rankMeta.minLevel + Math.floor(Math.random() * (rankMeta.maxLevel - rankMeta.minLevel + 1));
    const potentialScore = rollPotentialScore(rank);
    const unitId = `tavern-${block}-${slotIndex}-${Math.floor(Math.random() * 100000)}`;
    const unitName = rank === "SSS"
      ? pickRandom(availableSSSNames)
      : pickRandom(archetype.namePool);
    const unit = {
      id: unitId,
      name: unitName,
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
      potentialScore,
      trainingLevel: 0,
      trainingAttempts: 0,
      statPoints: Math.max(0, rankMeta.partySlots - 1),
      skillPoints: 0,
      equippedItemIds: [],
      signaturePassiveIds: [],
      signaturePassiveId: null,
      specialSkillIds: [],
      specialActiveSkillIds: [],
      recruitSource: "tavern",
      hiredAt: null
    };

    StatsService.normalizeUnitProgression(unit);
    SkillsService.normalizeUnitLearnedSkills(unit);

    for (let currentLevel = 2; currentLevel <= level; currentLevel += 1) {
      StatsService.applyLevelGains(unit, StatsService.rollLevelGains(unit, 5));
      unit.level = currentLevel;
    }

    applyBonusStats(unit, rankMeta.bonusStats);
    unit.hp = unit.maxHp;
    SkillsService.normalizeUnitLearnedSkills(unit);
    const startingWeaponType = pickStartingWeaponType(className, archetype.weaponType);
    unit.specialSkillIds = pickUniqueSkillIds(PASSIVE_SKILL_POOL[startingWeaponType], rankMeta.passiveSkills);
    unit.specialActiveSkillIds = pickUniqueSkillIds(ACTIVE_SKILL_POOL[startingWeaponType], rankMeta.activeSkills);
    const signaturePassiveIds = pickSignaturePassiveIds(className, rankMeta, unit.specialSkillIds, {
      rank,
      potentialScore
    });

    if (rank === "SSS") {
      appendUniqueSkillId(signaturePassiveIds, "otherworldly_existence");
    }

    signaturePassiveIds.forEach((skillId) => appendUniqueSkillId(unit.specialSkillIds, skillId));
    unit.signaturePassiveIds = signaturePassiveIds.slice();
    unit.signaturePassiveId = unit.signaturePassiveIds[0] || null;

    return {
      id: unitId,
      unit,
      guildRank: rank,
      hireCost: rankMeta.cost,
      rarity: rankMeta.cardRarity,
      rankTitle: rankMeta.title,
      potentialScore,
      potentialTier: StatsService.getPotentialMeta(unit).id,
      signaturePassiveId: unit.signaturePassiveId,
      signaturePassiveIds: unit.signaturePassiveIds.slice(),
      refreshBlock: block,
      recruitedAt: null,
      startingWeapon: buildWeapon(startingWeaponType, unitId, rank, level)
    };
  }

  function refreshLineup(saveData) {
    const tavern = ensureTavernShape(saveData);
    const block = getRefreshBlock();
    const reservedSSSNames = [];

    tavern.refreshBlock = block;
    tavern.lastRefreshAt = new Date().toISOString();
    tavern.nextRefreshAt = new Date(getNextRefreshTimestamp(block)).toISOString();
    tavern.lineup = Array.from({ length: LINEUP_SIZE }, (_, index) => {
      const candidate = buildAdventurerCandidate(saveData, block, index, reservedSSSNames);

      if (candidate && candidate.guildRank === "SSS" && candidate.unit && candidate.unit.name) {
        reservedSSSNames.push(candidate.unit.name);
      }

      return candidate;
    });
    return tavern;
  }

  function syncTavern(saveData) {
    const tavern = ensureTavernShape(saveData);
    const block = getRefreshBlock();
    const needsRefresh = tavern.refreshBlock !== block || !tavern.lineup.length || tavern.lineup.length !== LINEUP_SIZE;

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

  function getManualRefreshState(saveData) {
    const tavern = ensureTavernShape(saveData);
    const used = Math.max(0, Math.floor(Number(tavern.manualRefreshUsed || 0)));
    const remaining = Math.max(0, DAILY_MANUAL_REFRESH_LIMIT - used);
    const paidMode = remaining <= 0;
    const canAffordPaid = (saveData.partyGold || 0) >= PAID_MANUAL_REFRESH_COST;

    return {
      used,
      remaining,
      limit: DAILY_MANUAL_REFRESH_LIMIT,
      paidMode,
      refreshCost: PAID_MANUAL_REFRESH_COST,
      canAffordPaid,
      exhausted: paidMode ? !canAffordPaid : false,
      resetAt: new Date(getNextDailyResetTimestamp()).toISOString()
    };
  }

  function useManualRefresh(saveData) {
    const tavern = ensureTavernShape(saveData);
    const used = Math.max(0, Math.floor(Number(tavern.manualRefreshUsed || 0)));
    const remaining = Math.max(0, DAILY_MANUAL_REFRESH_LIMIT - used);

    if (remaining <= 0) {
      throw new Error("오늘 사용할 수 있는 무료 주점 새로고침을 모두 소진했습니다.");
    }

    tavern.manualRefreshUsed = used + 1;
    refreshLineup(saveData);

    return {
      tavern: saveData.tavern,
      manualState: getManualRefreshState(saveData)
    };
  }

  function usePaidRefresh(saveData) {
    ensureTavernShape(saveData);

    if ((saveData.partyGold || 0) < PAID_MANUAL_REFRESH_COST) {
      throw new Error(`새로고침에 필요한 골드가 부족합니다. (${PAID_MANUAL_REFRESH_COST}G 필요)`);
    }

    saveData.partyGold -= PAID_MANUAL_REFRESH_COST;
    refreshLineup(saveData);

    return {
      tavern: saveData.tavern,
      manualState: getManualRefreshState(saveData)
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

    StatsService.normalizeUnitProgression(unit);
    SkillsService.normalizeUnitLearnedSkills(unit);
    saveData.partyGold -= candidate.hireCost || 0;
    unit.hiredAt = new Date().toISOString();
    unit.weapon = null;
    unit.equippedItemIds = [];
    saveData.roster = saveData.roster || [];
    saveData.roster.push(unit);

    if ((saveData.selectedPartyIds || []).length < MAX_SORTIE_SIZE) {
      saveData.selectedPartyIds.push(unit.id);
    }

    candidate.recruitedAt = unit.hiredAt;
    return {
      unit,
      candidate
    };
  }

  function trainUnit(saveData, unitId) {
    const unit = (saveData.roster || []).find((entry) => entry.id === unitId);

    if (!unit) {
      throw new Error("훈련할 유닛을 찾을 수 없습니다.");
    }

    StatsService.normalizeUnitProgression(unit);

    if ((unit.trainingLevel || 0) >= StatsService.getTrainingCap(unit)) {
      throw new Error("이 유닛은 현재 잠재력 기준 훈련 한계에 도달했습니다.");
    }

    const cost = getTrainingCost(unit);

    if ((saveData.partyGold || 0) < cost) {
      throw new Error("훈련에 필요한 골드가 부족합니다.");
    }

    saveData.partyGold -= cost;
    unit.trainingLevel += 1;
    unit.trainingAttempts = Math.max(0, Number(unit.trainingAttempts || 0)) + 1;

    const gains = StatsService.rollTrainingGains(unit);
    StatsService.applyLevelGains(unit, gains);

    return {
      unit,
      cost,
      gains,
      potentialMeta: StatsService.getPotentialMeta(unit)
    };
  }

  function promoteGuildRank(saveData, unitId) {
    const unit = (saveData.roster || []).find((entry) => entry.id === unitId);

    if (!unit) {
      throw new Error("승급할 유닛을 찾을 수 없습니다.");
    }

    StatsService.normalizeUnitProgression(unit);

    const requirement = getRankPromotionRequirement(unit);

    if (!requirement || !requirement.nextRank) {
      throw new Error("이미 최고 길드 등급입니다.");
    }

    if ((unit.level || 1) < requirement.minLevel) {
      throw new Error(`승급하려면 Lv.${requirement.minLevel} 이상이 필요합니다.`);
    }

    if ((unit.trainingLevel || 0) < requirement.minTrainingLevel) {
      throw new Error(`승급하려면 훈련 ${requirement.minTrainingLevel}단계가 필요합니다.`);
    }

    if ((saveData.partyGold || 0) < requirement.cost) {
      throw new Error("승급에 필요한 골드가 부족합니다.");
    }

    saveData.partyGold -= requirement.cost;

    const previousRank = unit.guildRank || "D";
    unit.guildRank = requirement.nextRank;
    unit.rankPromotionHistory = unit.rankPromotionHistory || [];
    unit.rankPromotionHistory.push({
      from: previousRank,
      to: requirement.nextRank,
      promotedAtLevel: unit.level || 1,
      promotedAtTrainingLevel: unit.trainingLevel || 0
    });
    unit.statPoints = Math.max(0, Number(unit.statPoints || 0)) + Number(requirement.rewardStatPoints || 0);
    unit.skillPoints = Math.max(0, Number(unit.skillPoints || 0)) + Number(requirement.rewardSkillPoints || 0);

    const gains = StatsService.rollLevelGains(unit, requirement.rewardGrowthPoints || 0);
    StatsService.applyLevelGains(unit, gains);

    return {
      unit,
      previousRank,
      nextRank: requirement.nextRank,
      requirement,
      gains
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

  function dismissUnit(saveData, unitId) {
    const roster = saveData.roster || [];
    const unit = roster.find((entry) => entry.id === unitId);

    if (!unit) {
      throw new Error("방출할 유닛을 찾을 수 없습니다.");
    }

    if (roster.length <= 1) {
      throw new Error("마지막 남은 캐릭터는 방출할 수 없습니다.");
    }

    if (saveData.stageStatus === "in_progress" && saveData.battleState) {
      throw new Error("진행 중인 전투가 있을 때는 캐릭터를 방출할 수 없습니다.");
    }

    (unit.equippedItemIds || []).slice().forEach((itemId) => {
      InventoryService.unequipItem(saveData, itemId);
    });

    saveData.roster = roster.filter((entry) => entry.id !== unitId);
    saveData.selectedPartyIds = (saveData.selectedPartyIds || [])
      .filter((selectedId) => selectedId !== unitId)
      .slice(0, MAX_SORTIE_SIZE);

    if (!saveData.selectedPartyIds.length) {
      saveData.selectedPartyIds = (saveData.roster || [])
        .slice(0, MAX_SORTIE_SIZE)
        .map((entry) => entry.id);
    }

    const nextLeader = (saveData.roster || []).find((entry) => entry.id === saveData.leaderUnitId)
      || (saveData.roster || [])[0]
      || null;

    saveData.leaderUnitId = nextLeader ? nextLeader.id : null;

    return {
      unit,
      leaderUnit: nextLeader
    };
  }

  function getRankMeta(rank) {
    return GUILD_RANK_META[rank] || GUILD_RANK_META.D;
  }

  global.TavernService = {
    REFRESH_INTERVAL_MS,
    DAILY_MANUAL_REFRESH_LIMIT,
    PAID_MANUAL_REFRESH_COST,
    GUILD_RANK_META,
    GUILD_RANK_ORDER,
    syncTavern,
    getManualRefreshState,
    useManualRefresh,
    usePaidRefresh,
    recruitAdventurer,
    trainUnit,
    promoteGuildRank,
    setLeader,
    dismissUnit,
    getRankMeta,
    getTrainingCost,
    getRankPromotionRequirement,
    getNextGuildRank
  };
})(window);
