/* 역할: 아이템 희귀도, 장비 가능 여부, 드롭 생성, 파티 인벤토리 장착 처리를 담당한다. */

(function attachInventoryService(global) {
  const StorageService = global.StorageService;
  const StatsService = global.StatsService;
  const PRIMARY_STATS = ["str", "dex", "vit", "int", "luk"];

  const RARITY_ORDER = [
    "common",
    "uncommon",
    "rare",
    "unique",
    "legendary",
    "epic",
    "mystic",
    "primordial"
  ];

  const RARITY_META = {
    common: { label: "커먼", colorVar: "--common", weight: 46 },
    uncommon: { label: "언커먼", colorVar: "--uncommon", weight: 24 },
    rare: { label: "레어", colorVar: "--rare", weight: 14 },
    unique: { label: "유니크", colorVar: "--unique", weight: 8 },
    legendary: { label: "레전더리", colorVar: "--legendary", weight: 5 },
    epic: { label: "에픽", colorVar: "--epic", weight: 2.2 },
    mystic: { label: "신화", colorVar: "--mystic", weight: 0.7 },
    primordial: { label: "태초", colorVar: "--primordial", weight: 0.18 }
  };

  const SHOP_PRICE_MULTIPLIER_BY_RARITY = {
    common: 1.7,
    uncommon: 2.1,
    rare: 2.7,
    unique: 3.5,
    legendary: 4.6,
    epic: 6,
    mystic: 7.8,
    primordial: 10
  };

  const MISC_ITEM_DEFINITIONS = {
    "refine-stone-basic": {
      id: "refine-stone-basic",
      name: "재련석",
      itemType: "misc",
      slot: "misc",
      type: "misc",
      rarity: "common",
      stackable: true,
      description: "대장간에서 무기 재련에 사용하는 기본 재료"
    }
  };

  const REINFORCE_MAX_LEVEL = 10;
  const REINFORCE_BASE_COST_TABLE = [
    { level: 0, gold: 150, stones: 1 },
    { level: 1, gold: 220, stones: 1 },
    { level: 2, gold: 320, stones: 2 },
    { level: 3, gold: 450, stones: 2 },
    { level: 4, gold: 650, stones: 3 },
    { level: 5, gold: 900, stones: 4 },
    { level: 6, gold: 1200, stones: 5 },
    { level: 7, gold: 1600, stones: 6 },
    { level: 8, gold: 2100, stones: 7 },
    { level: 9, gold: 2800, stones: 9 }
  ];
  const REINFORCE_RARITY_MULTIPLIER = {
    common: 1,
    uncommon: 1.15,
    rare: 1.3,
    unique: 1.5,
    legendary: 1.75,
    epic: 2.05,
    mystic: 2.4,
    primordial: 2.85
  };

  const EQUIP_SLOT_LAYOUT = [
    { key: "head", label: "머리", accepts: ["head"] },
    { key: "chest", label: "상의", accepts: ["chest", "shoulder"] },
    { key: "legs", label: "하의", accepts: ["legs"] },
    { key: "boots", label: "신발", accepts: ["boots"] },
    { key: "bracelet", label: "팔찌", accepts: ["bracelet"] },
    { key: "ring", label: "반지", accepts: ["ring"] },
    { key: "weapon", label: "주무기", accepts: ["weapon"] },
    { key: "subweapon", label: "보조무기", accepts: ["subweapon"] },
    { key: "charm", label: "부적", accepts: ["charm", "accessory"] }
  ];

  const EQUIP_SLOT_META = EQUIP_SLOT_LAYOUT.reduce((accumulator, entry) => {
    accumulator[entry.key] = entry;
    return accumulator;
  }, {});

  const ITEM_TYPE_META = {
    sword: "검",
    greatsword: "대검",
    tachi: "태도",
    katana: "카타나",
    hwando: "환도",
    lance: "창",
    spear: "장창",
    halberd: "할버드",
    bow: "활",
    shortbow: "단궁",
    longbow: "장궁",
    crossbow: "석궁",
    axe: "도끼",
    handaxe: "손도끼",
    battleaxe: "전투도끼",
    greataxe: "대도끼",
    staff: "지팡이",
    wand: "완드",
    tome: "고서",
    grimoire: "마도서",
    shield: "방패",
    quiver: "화살통",
    focus: "성구",
    arcane_orb: "마도구",
    holy_relic: "성유물",
    helmet: "투구",
    hood: "후드",
    shoulder_guard: "견갑",
    mantle: "망토",
    armor: "갑옷",
    robe: "로브",
    greaves: "경갑",
    leggings: "레깅스",
    boots: "부츠",
    bracelet: "팔찌",
    ring: "반지",
    charm: "부적",
    accessory: "장신구",
    consumable: "소모품",
    misc: "기타"
  };

  const STAT_LABELS = {
    maxHp: "HP",
    str: "STR",
    skl: "SKL",
    spd: "SPD",
    def: "DEF",
    mov: "MOV"
  };

  const PRIMARY_STAT_LABELS = {
    str: "STR",
    dex: "DEX",
    vit: "VIT",
    int: "INT",
    luk: "LUK"
  };

  const HIDDEN_BONUS_LABELS = {
    physicalAttack: "물공",
    skillPower: "스킬 위력",
    healPower: "회복력",
    magicAttack: "마공",
    magicDefense: "마방",
    maxMana: "마나",
    manaRegen: "마나 회복",
    accuracy: "명중",
    evasion: "회피",
    physicalDefense: "물방",
    rangedDefense: "원거리 방어",
    critChance: "치명",
    critDamageBonus: "치명 피해",
    physicalDamagePercent: "물리 피해",
    magicDamagePercent: "마법 피해",
    bossDamagePercent: "보스 피해",
    firstStrikeDamagePercent: "선공 피해",
    comboStrikeDamagePercent: "연속 공격 피해",
    counterDamagePercent: "반격 피해",
    damageReductionPercent: "피해 감소",
    rangedDamageReductionPercent: "원거리 피해 감소",
    blockChance: "막기",
    statusResistChance: "상태 저항",
    cooldownReduction: "재사용 감소",
    goldGainBonus: "골드 획득",
    monsterGoldBonus: "처치 골드",
    lifeStealPercent: "흡혈",
    killHealFlat: "처치 회복",
    rangeBonus: "사거리",
    bleedChance: "출혈 확률",
    burnChance: "화상 확률",
    poisonChance: "중독 확률",
    freezeChance: "빙결 확률",
    statusDurationBonus: "상태 지속",
    statusTargetDamagePercent: "상태 적 피해",
    moveThenAttackDamagePercent: "이동 후 피해",
    lowHpAttackPercent: "저체력 공격",
    executeDamagePercent: "마무리 피해",
    dropRateBonus: "드랍률",
    lootQualityBonus: "희귀도 운"
  };

  const PERCENT_HIDDEN_BONUS_KEYS = new Set([
    "critChance",
    "critDamageBonus",
    "physicalDamagePercent",
    "magicDamagePercent",
    "bossDamagePercent",
    "firstStrikeDamagePercent",
    "comboStrikeDamagePercent",
    "counterDamagePercent",
    "damageReductionPercent",
    "rangedDamageReductionPercent",
    "blockChance",
    "statusResistChance",
    "goldGainBonus",
    "monsterGoldBonus",
    "lifeStealPercent",
    "bleedChance",
    "burnChance",
    "poisonChance",
    "freezeChance",
    "statusDurationBonus",
    "statusTargetDamagePercent",
    "moveThenAttackDamagePercent",
    "lowHpAttackPercent",
    "executeDamagePercent",
    "dropRateBonus",
    "lootQualityBonus"
  ]);

  const WEAPON_TYPES_BY_DISCIPLINE = {
    physical: [
      "sword", "greatsword", "tachi", "katana", "hwando",
      "lance", "spear", "halberd",
      "axe", "handaxe", "battleaxe", "greataxe",
      "bow", "shortbow", "longbow", "crossbow"
    ],
    magic: ["staff", "wand", "tome", "grimoire", "focus"]
  };

  const WEAPON_FAMILY_BY_TYPE = {
    sword: "blade",
    greatsword: "blade",
    tachi: "blade",
    katana: "blade",
    hwando: "blade",
    lance: "polearm",
    spear: "polearm",
    halberd: "polearm",
    bow: "ranged",
    shortbow: "ranged",
    longbow: "ranged",
    crossbow: "ranged",
    axe: "cleaver",
    handaxe: "cleaver",
    battleaxe: "cleaver",
    greataxe: "cleaver",
    staff: "arcane",
    wand: "arcane",
    tome: "arcane",
    grimoire: "arcane",
    focus: "sacred"
  };

  const CLASS_WEAPON_DISCIPLINES = {
    로드: "physical",
    하이로드: "physical",
    클레릭: "magic",
    비숍: "magic",
    메이지: "magic",
    위저드: "magic",
    소서러: "magic",
    랜서: "physical",
    팔라딘: "physical",
    아처: "physical",
    스나이퍼: "physical",
    검사: "physical",
    브리건드: "physical",
    헌터: "physical",
    솔저: "physical",
    블레이드로드: "physical",
    소드마스터: "physical",
    엠퍼러: "physical",
    검성: "physical",
    오버로드: "physical",
    스타블레이드: "physical",
    가디언: "physical",
    센티넬: "physical",
    홀리랜서: "physical",
    포트리스: "physical",
    아크랜서: "physical",
    이지스로드: "physical",
    레인저: "physical",
    트래퍼: "physical",
    호크아이: "physical",
    그림트래퍼: "physical",
    천궁성: "physical",
    나이트메어헌트: "physical",
    버서커: "physical",
    워브레이커: "physical",
    데스브링어: "physical",
    월드이터: "physical",
    오라클: "magic",
    세라핌: "magic",
    인퀴지터: "magic",
    성녀: "magic",
    아크저지: "magic",
    아크메이지: "magic",
    워록: "magic",
    대현자: "magic",
    보이드로드: "magic"
  };

  const CLASS_WEAPONS = Object.keys(CLASS_WEAPON_DISCIPLINES).reduce((accumulator, className) => {
    const discipline = CLASS_WEAPON_DISCIPLINES[className];
    accumulator[className] = (WEAPON_TYPES_BY_DISCIPLINE[discipline] || ["sword"]).slice();
    return accumulator;
  }, {});

  const CLASS_WEAPON_PROFICIENCY = {};
  [
    "로드", "하이로드", "블레이드로드", "소드마스터", "엠퍼러", "검성", "오버로드", "스타블레이드", "검사"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["blade"], toleratedFamilies: ["polearm"] };
  });
  [
    "랜서", "팔라딘", "가디언", "센티넬", "홀리랜서", "포트리스", "아크랜서", "이지스로드", "솔저"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["polearm"], toleratedFamilies: ["blade"] };
  });
  [
    "아처", "스나이퍼", "레인저", "트래퍼", "호크아이", "그림트래퍼", "천궁성", "나이트메어헌트", "헌터"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["ranged"], toleratedFamilies: ["blade"] };
  });
  [
    "브리건드", "버서커", "워브레이커", "데스브링어", "월드이터"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["cleaver"], toleratedFamilies: ["blade", "polearm"] };
  });
  [
    "메이지", "위저드", "소서러", "아크메이지", "워록", "대현자", "보이드로드"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["arcane"], toleratedFamilies: ["sacred"] };
  });
  [
    "클레릭", "비숍", "오라클", "세라핌", "인퀴지터", "성녀", "아크저지"
  ].forEach((className) => {
    CLASS_WEAPON_PROFICIENCY[className] = { favoredFamilies: ["sacred"], toleratedFamilies: ["arcane"] };
  });

  const WEAPON_EQUIP_RULES = {
    sword: { offhandRoles: ["shield"] },
    greatsword: {},
    tachi: {},
    katana: { offhandRoles: ["shield"] },
    hwando: { offhandRoles: ["shield"] },
    lance: { offhandRoles: ["shield"] },
    spear: { offhandRoles: ["shield"] },
    halberd: {},
    bow: { offhandRoles: ["quiver"] },
    shortbow: { offhandRoles: ["quiver"] },
    longbow: { offhandRoles: ["quiver"] },
    crossbow: { offhandRoles: ["quiver"] },
    axe: {},
    handaxe: { offhandRoles: ["shield"], offhandWeaponTypes: ["handaxe"] },
    battleaxe: {},
    greataxe: {},
    staff: { offhandRoles: ["arcane"] },
    wand: { offhandRoles: ["arcane"] },
    tome: { offhandRoles: ["arcane"] },
    grimoire: { offhandRoles: ["arcane"] },
    focus: { offhandRoles: ["sacred"] }
  };

  const SUBWEAPON_ROLE_BY_TYPE = {
    shield: "shield",
    quiver: "quiver",
    arcane_orb: "arcane",
    holy_relic: "sacred"
  };

  const CLASS_SUBWEAPON_ROLES = {};
  [
    "로드", "하이로드", "블레이드로드", "소드마스터", "엠퍼러", "검성", "오버로드", "스타블레이드", "검사",
    "랜서", "팔라딘", "가디언", "센티넬", "홀리랜서", "포트리스", "아크랜서", "이지스로드", "솔저",
    "브리건드", "버서커", "워브레이커", "데스브링어", "월드이터"
  ].forEach((className) => {
    CLASS_SUBWEAPON_ROLES[className] = ["shield"];
  });
  [
    "아처", "스나이퍼", "레인저", "트래퍼", "호크아이", "그림트래퍼", "천궁성", "나이트메어헌트", "헌터"
  ].forEach((className) => {
    CLASS_SUBWEAPON_ROLES[className] = ["quiver"];
  });
  [
    "메이지", "위저드", "소서러", "아크메이지", "워록", "대현자", "보이드로드"
  ].forEach((className) => {
    CLASS_SUBWEAPON_ROLES[className] = ["arcane"];
  });
  [
    "클레릭", "비숍", "오라클", "세라핌", "인퀴지터", "성녀", "아크저지"
  ].forEach((className) => {
    CLASS_SUBWEAPON_ROLES[className] = ["sacred", "arcane"];
  });

  const LOOT_TEMPLATES = [
    {
      key: "sword",
      names: {
        common: "철검",
        uncommon: "바람검",
        rare: "청광검",
        unique: "매혹검",
        legendary: "태양검",
        epic: "황혼검",
        mystic: "아르카디아",
        primordial: "여명개벽"
      },
      slot: "weapon",
      type: "sword",
      base: { might: 5, hit: 86, rangeMin: 1, rangeMax: 1, uses: 35 }
    },
    {
      key: "greatsword",
      names: {
        common: "철대검",
        uncommon: "개척 대검",
        rare: "청강 대검",
        unique: "사자 대검",
        legendary: "태양 대검",
        epic: "성운 대검",
        mystic: "발뭉",
        primordial: "거성 절단자"
      },
      slot: "weapon",
      type: "greatsword",
      base: { might: 8, hit: 76, rangeMin: 1, rangeMax: 1, uses: 30 }
    },
    {
      key: "tachi",
      names: {
        common: "철태도",
        uncommon: "바람 태도",
        rare: "유광 태도",
        unique: "군청 태도",
        legendary: "홍염 태도",
        epic: "월광 태도",
        mystic: "무명태도",
        primordial: "천개일섬"
      },
      slot: "weapon",
      type: "tachi",
      base: { might: 6, hit: 90, rangeMin: 1, rangeMax: 1, uses: 34 }
    },
    {
      key: "katana",
      names: {
        common: "철카타나",
        uncommon: "유풍 카타나",
        rare: "청운 카타나",
        unique: "적월 카타나",
        legendary: "폭심 카타나",
        epic: "혜광 카타나",
        mystic: "무라마사",
        primordial: "공허를 가르는 칼날"
      },
      slot: "weapon",
      type: "katana",
      base: { might: 6, hit: 92, rangeMin: 1, rangeMax: 1, uses: 32 }
    },
    {
      key: "hwando",
      names: {
        common: "철환도",
        uncommon: "청풍 환도",
        rare: "은광 환도",
        unique: "군영 환도",
        legendary: "황염 환도",
        epic: "패왕 환도",
        mystic: "칠지도",
        primordial: "일월환도"
      },
      slot: "weapon",
      type: "hwando",
      base: { might: 7, hit: 84, rangeMin: 1, rangeMax: 1, uses: 36 }
    },
    {
      key: "lance",
      names: {
        common: "철창",
        uncommon: "청풍창",
        rare: "은광창",
        unique: "장미창",
        legendary: "폭열창",
        epic: "성광창",
        mystic: "롱기누스",
        primordial: "창세의 못"
      },
      slot: "weapon",
      type: "lance",
      base: { might: 6, hit: 80, rangeMin: 1, rangeMax: 1, uses: 32 }
    },
    {
      key: "spear",
      names: {
        common: "철장창",
        uncommon: "청풍 장창",
        rare: "은광 장창",
        unique: "군영 장창",
        legendary: "폭열 장창",
        epic: "성운 장창",
        mystic: "게이볼그",
        primordial: "관통의 첫 별"
      },
      slot: "weapon",
      type: "spear",
      base: { might: 6, hit: 84, rangeMin: 1, rangeMax: 1, uses: 36 }
    },
    {
      key: "halberd",
      names: {
        common: "철할버드",
        uncommon: "전투 할버드",
        rare: "청명 할버드",
        unique: "기사 할버드",
        legendary: "황염 할버드",
        epic: "천광 할버드",
        mystic: "용익월",
        primordial: "세계수의 단두"
      },
      slot: "weapon",
      type: "halberd",
      base: { might: 8, hit: 78, rangeMin: 1, rangeMax: 1, uses: 30 }
    },
    {
      key: "bow",
      names: {
        common: "사냥 활",
        uncommon: "하늘 활",
        rare: "유성 활",
        unique: "장미 활",
        legendary: "화염 활",
        epic: "태양 활",
        mystic: "아르테미스",
        primordial: "새벽의 활현"
      },
      slot: "weapon",
      type: "bow",
      base: { might: 5, hit: 88, rangeMin: 2, rangeMax: 2, uses: 30 }
    },
    {
      key: "shortbow",
      names: {
        common: "사냥 단궁",
        uncommon: "질풍 단궁",
        rare: "청영 단궁",
        unique: "매눈 단궁",
        legendary: "혜성 단궁",
        epic: "성광 단궁",
        mystic: "요정 단궁",
        primordial: "첫 사냥의 활"
      },
      slot: "weapon",
      type: "shortbow",
      base: { might: 4, hit: 94, rangeMin: 2, rangeMax: 2, uses: 34 }
    },
    {
      key: "longbow",
      names: {
        common: "사냥 장궁",
        uncommon: "산맥 장궁",
        rare: "유성 장궁",
        unique: "매사냥 장궁",
        legendary: "태양 장궁",
        epic: "천공 장궁",
        mystic: "아르테미스 장궁",
        primordial: "여명의 장현"
      },
      slot: "weapon",
      type: "longbow",
      base: { might: 6, hit: 86, rangeMin: 2, rangeMax: 3, uses: 28 }
    },
    {
      key: "crossbow",
      names: {
        common: "철석궁",
        uncommon: "강화 석궁",
        rare: "청동 석궁",
        unique: "공성 석궁",
        legendary: "황금 석궁",
        epic: "천쇄 석궁",
        mystic: "가스트라페테스",
        primordial: "개벽의 노궁"
      },
      slot: "weapon",
      type: "crossbow",
      base: { might: 7, hit: 82, rangeMin: 2, rangeMax: 2, uses: 30 }
    },
    {
      key: "staff",
      names: {
        common: "견습 지팡이",
        uncommon: "마력 지팡이",
        rare: "청명 지팡이",
        unique: "현자의 지팡이",
        legendary: "별빛 지팡이",
        epic: "천공 지팡이",
        mystic: "헤르메스의 지팡이",
        primordial: "원초의 성간목"
      },
      slot: "weapon",
      type: "staff",
      base: { might: 5, hit: 90, rangeMin: 1, rangeMax: 3, uses: 30 }
    },
    {
      key: "wand",
      names: {
        common: "견습 완드",
        uncommon: "은빛 완드",
        rare: "청광 완드",
        unique: "현인 완드",
        legendary: "성광 완드",
        epic: "혜성 완드",
        mystic: "머큐리 완드",
        primordial: "시원의 마도핵"
      },
      slot: "weapon",
      type: "wand",
      base: { might: 4, hit: 94, rangeMin: 1, rangeMax: 2, uses: 34 }
    },
    {
      key: "tome",
      names: {
        common: "낡은 고서",
        uncommon: "봉인 고서",
        rare: "청람 고서",
        unique: "지혜의 고서",
        legendary: "황금 고서",
        epic: "별운 고서",
        mystic: "솔로몬의 서",
        primordial: "창세의 서판"
      },
      slot: "weapon",
      type: "tome",
      base: { might: 5, hit: 88, rangeMin: 1, rangeMax: 2, uses: 32 }
    },
    {
      key: "grimoire",
      names: {
        common: "검은 마도서",
        uncommon: "심연 마도서",
        rare: "청명 마도서",
        unique: "현자의 마도서",
        legendary: "혜성 마도서",
        epic: "천문 마도서",
        mystic: "네크로노미콘",
        primordial: "원초의 서고"
      },
      slot: "weapon",
      type: "grimoire",
      base: { might: 6, hit: 86, rangeMin: 1, rangeMax: 3, uses: 28 }
    },
    {
      key: "axe",
      names: {
        common: "철도끼",
        uncommon: "산들 도끼",
        rare: "청명 도끼",
        unique: "분홍 도끼",
        legendary: "폭염 도끼",
        epic: "천광 도끼",
        mystic: "기가스 파쇄도",
        primordial: "반고의 파편"
      },
      slot: "weapon",
      type: "axe",
      base: { might: 7, hit: 74, rangeMin: 1, rangeMax: 1, uses: 28 }
    },
    {
      key: "handaxe",
      names: {
        common: "철손도끼",
        uncommon: "질풍 손도끼",
        rare: "청염 손도끼",
        unique: "투척 손도끼",
        legendary: "폭열 손도끼",
        epic: "천광 손도끼",
        mystic: "프란시스카",
        primordial: "유성 파편도끼"
      },
      slot: "weapon",
      type: "handaxe",
      base: { might: 6, hit: 80, rangeMin: 1, rangeMax: 2, uses: 30 }
    },
    {
      key: "battleaxe",
      names: {
        common: "철전투도끼",
        uncommon: "청강 전투도끼",
        rare: "은광 전투도끼",
        unique: "장군 전투도끼",
        legendary: "태양 전투도끼",
        epic: "성운 전투도끼",
        mystic: "라브리스",
        primordial: "천둥 분단도"
      },
      slot: "weapon",
      type: "battleaxe",
      base: { might: 8, hit: 76, rangeMin: 1, rangeMax: 1, uses: 32 }
    },
    {
      key: "greataxe",
      names: {
        common: "철대도끼",
        uncommon: "개척 대도끼",
        rare: "청명 대도끼",
        unique: "거인 대도끼",
        legendary: "폭군 대도끼",
        epic: "천추 대도끼",
        mystic: "미노스 파쇄도",
        primordial: "종말의 도끼날"
      },
      slot: "weapon",
      type: "greataxe",
      base: { might: 10, hit: 70, rangeMin: 1, rangeMax: 1, uses: 26 }
    },
    {
      key: "focus",
      names: {
        common: "기도 성구",
        uncommon: "은빛 성구",
        rare: "축성 성구",
        unique: "성광 촉매",
        legendary: "대사제의 성구",
        epic: "천상의 촉매",
        mystic: "요한의 계시록",
        primordial: "첫 빛의 잔"
      },
      slot: "weapon",
      type: "focus",
      base: { might: 4, hit: 92, rangeMin: 1, rangeMax: 2, uses: 32 }
    },
    {
      key: "helmet",
      names: {
        common: "견습 철투구",
        uncommon: "정찰 두건",
        rare: "수호 철면",
        unique: "사자 왕관",
        legendary: "태양 투구",
        epic: "천공 면갑",
        mystic: "솔로몬의 관",
        primordial: "무명의 원관"
      },
      slot: "head",
      type: "helmet",
      baseBonus: { def: 1, maxHp: 1 }
    },
    {
      key: "shoulder_guard",
      names: {
        common: "가죽 견갑",
        uncommon: "바람 견갑",
        rare: "성채 견갑",
        unique: "사령관 견갑",
        legendary: "불꽃 견갑",
        epic: "천광 견갑",
        mystic: "헤라클레스의 어깨",
        primordial: "태동의 견갑"
      },
      slot: "shoulder",
      type: "shoulder_guard",
      baseBonus: { def: 1, str: 1 }
    },
    {
      key: "armor",
      names: {
        common: "모험가 갑옷",
        uncommon: "정예 흉갑",
        rare: "강철 전투복",
        unique: "수호 로브",
        legendary: "황금 흉갑",
        epic: "천공 갑주",
        mystic: "아이기스의 성의",
        primordial: "무구의 첫 갑주"
      },
      slot: "chest",
      type: "armor",
      baseBonus: { maxHp: 2, def: 1 }
    },
    {
      key: "leggings",
      names: {
        common: "훈련용 하의",
        uncommon: "기동 전투복",
        rare: "정찰 레깅스",
        unique: "비호 각반",
        legendary: "질풍 경갑",
        epic: "성운 하의",
        mystic: "아탈란테의 각반",
        primordial: "개벽의 보행"
      },
      slot: "legs",
      type: "leggings",
      baseBonus: { spd: 1, skl: 1 }
    },
    {
      key: "boots",
      names: {
        common: "가죽 장화",
        uncommon: "개척 부츠",
        rare: "질풍 장화",
        unique: "전령 군화",
        legendary: "금빛 장화",
        epic: "혜성 부츠",
        mystic: "헤르메스의 비익",
        primordial: "시원의 발자취"
      },
      slot: "boots",
      type: "boots",
      baseBonus: { mov: 1, spd: 1 }
    },
    {
      key: "bracelet",
      names: {
        common: "나무 팔찌",
        uncommon: "구리 팔찌",
        rare: "은빛 팔찌",
        unique: "기사 팔찌",
        legendary: "태양 팔찌",
        epic: "천뢰 팔찌",
        mystic: "모이라의 매듭",
        primordial: "태초의 환대"
      },
      slot: "bracelet",
      type: "bracelet",
      baseBonus: { str: 1, maxHp: 1 }
    },
    {
      key: "ring",
      names: {
        common: "청동 반지",
        uncommon: "집중 반지",
        rare: "명사수 반지",
        unique: "군주의 반지",
        legendary: "광휘 반지",
        epic: "혜성 반지",
        mystic: "안드바리나우트",
        primordial: "무한의 첫 고리"
      },
      slot: "ring",
      type: "ring",
      baseBonus: { skl: 1, spd: 1 }
    },
    {
      key: "shield",
      names: {
        common: "훈련 방패",
        uncommon: "강화 방패",
        rare: "수호 방패",
        unique: "요새 방패",
        legendary: "성광 방패",
        epic: "천벽 방패",
        mystic: "아테나의 방벽",
        primordial: "개벽의 편린"
      },
      slot: "subweapon",
      type: "shield",
      baseBonus: { def: 2, maxHp: 1 }
    },
    {
      key: "quiver",
      names: {
        common: "사냥 화살통",
        uncommon: "정찰 화살통",
        rare: "매눈 화살통",
        unique: "명수 화살통",
        legendary: "천궁 화살통",
        epic: "유성 화살통",
        mystic: "아폴론의 화살집",
        primordial: "새벽 사수의 화살통"
      },
      slot: "subweapon",
      type: "quiver",
      basePrimaryBonus: { dex: 1 },
      baseHiddenBonus: { accuracy: 4, critChance: 0.01 }
    },
    {
      key: "arcane_orb",
      names: {
        common: "견습 마도구",
        uncommon: "은빛 마도구",
        rare: "청명 마도구",
        unique: "현자의 마도구",
        legendary: "별빛 마도구",
        epic: "성운 마도구",
        mystic: "원환의 마핵",
        primordial: "태초의 비전핵"
      },
      slot: "subweapon",
      type: "arcane_orb",
      basePrimaryBonus: { int: 1 },
      baseHiddenBonus: { magicAttack: 2, maxMana: 4 }
    },
    {
      key: "holy_relic",
      names: {
        common: "순례 성유물",
        uncommon: "은빛 성유물",
        rare: "축성 성유물",
        unique: "대사제 성유물",
        legendary: "광휘 성유물",
        epic: "천상 성유물",
        mystic: "첫 기도의 유물",
        primordial: "새벽 신앙의 증표"
      },
      slot: "subweapon",
      type: "holy_relic",
      basePrimaryBonus: { int: 1 },
      baseHiddenBonus: { healPower: 2, magicDefense: 2, maxMana: 3 }
    },
    {
      key: "charm",
      names: {
        common: "참나무 부적",
        uncommon: "매눈 부적",
        rare: "정예 부적",
        unique: "수호 인장",
        legendary: "황금 인장",
        epic: "성운 인장",
        mystic: "야훼의 인장",
        primordial: "처음의 문양"
      },
      slot: "charm",
      type: "charm",
      baseBonus: { def: 1, skl: 1 }
    }
  ];

  const SHOP_CATALOG = [
    {
      id: "shop-potion",
      name: "회복 물약",
      type: "consumable",
      slot: "consumable",
      rarity: "common",
      price: 55,
      description: "전투 중 또는 준비 화면에서 HP를 10 회복한다.",
      effect: { kind: "heal", amount: 10 }
    },
    {
      id: "shop-hi-potion",
      name: "고급 물약",
      type: "consumable",
      slot: "consumable",
      rarity: "uncommon",
      price: 110,
      description: "HP를 18 회복한다.",
      effect: { kind: "heal", amount: 18 }
    },
    {
      id: "shop-stat-reset-scroll",
      name: "기억 재편 두루마리",
      type: "consumable",
      slot: "consumable",
      rarity: "rare",
      availableInShop: false,
      price: 180,
      description: "수동으로 분배한 1차 스탯 포인트를 모두 회수해 다시 투자할 수 있게 한다.",
      effect: { kind: "reset_stats" }
    },
    {
      id: "shop-iron-sword",
      name: "철검 보급품",
      type: "sword",
      slot: "weapon",
      rarity: "common",
      price: 120,
      description: "물리 계열이 두루 다루기 쉬운 표준 검.",
      might: 6,
      hit: 88,
      rangeMin: 1,
      rangeMax: 1,
      uses: 36
    },
    {
      id: "shop-greatsword-crate",
      name: "대검 보급품",
      type: "greatsword",
      slot: "weapon",
      rarity: "uncommon",
      price: 142,
      description: "무겁지만 위력이 높은 대검 계열 무기.",
      might: 9,
      hit: 78,
      rangeMin: 1,
      rangeMax: 1,
      uses: 30
    },
    {
      id: "shop-katana-kit",
      name: "카타나 보급품",
      type: "katana",
      slot: "weapon",
      rarity: "uncommon",
      price: 148,
      description: "날렵한 검격에 어울리는 카타나 계열 무기.",
      might: 7,
      hit: 92,
      rangeMin: 1,
      rangeMax: 1,
      uses: 32
    },
    {
      id: "shop-hwando-kit",
      name: "환도 보급품",
      type: "hwando",
      slot: "weapon",
      rarity: "rare",
      price: 158,
      description: "무게와 안정감을 챙긴 환도 계열 무기.",
      might: 8,
      hit: 86,
      rangeMin: 1,
      rangeMax: 1,
      uses: 34
    },
    {
      id: "shop-iron-lance",
      name: "철창 보급품",
      type: "lance",
      slot: "weapon",
      rarity: "common",
      price: 128,
      description: "물리 계열이 안정적으로 운용할 수 있는 표준 창.",
      might: 7,
      hit: 80,
      rangeMin: 1,
      rangeMax: 1,
      uses: 34
    },
    {
      id: "shop-halberd-crate",
      name: "할버드 보급품",
      type: "halberd",
      slot: "weapon",
      rarity: "uncommon",
      price: 146,
      description: "묵직한 일격에 특화된 할버드 계열 무기.",
      might: 8,
      hit: 78,
      rangeMin: 1,
      rangeMax: 1,
      uses: 30
    },
    {
      id: "shop-hunter-bow",
      name: "사냥 활 보급품",
      type: "bow",
      slot: "weapon",
      rarity: "common",
      price: 124,
      description: "물리 계열이 사용할 수 있는 기본 활.",
      might: 6,
      hit: 86,
      rangeMin: 2,
      rangeMax: 2,
      uses: 32
    },
    {
      id: "shop-shortbow-kit",
      name: "단궁 보급품",
      type: "shortbow",
      slot: "weapon",
      rarity: "uncommon",
      price: 134,
      description: "가볍고 명중이 높은 단궁 계열 무기.",
      might: 4,
      hit: 94,
      rangeMin: 2,
      rangeMax: 2,
      uses: 34
    },
    {
      id: "shop-longbow-kit",
      name: "장궁 보급품",
      type: "longbow",
      slot: "weapon",
      rarity: "rare",
      price: 156,
      description: "긴 사거리를 가진 장궁 계열 무기.",
      might: 6,
      hit: 86,
      rangeMin: 2,
      rangeMax: 3,
      uses: 28
    },
    {
      id: "shop-crossbow-kit",
      name: "석궁 보급품",
      type: "crossbow",
      slot: "weapon",
      rarity: "rare",
      price: 162,
      description: "무겁지만 강한 일격을 주는 석궁 계열 무기.",
      might: 7,
      hit: 82,
      rangeMin: 2,
      rangeMax: 2,
      uses: 30
    },
    {
      id: "shop-apprentice-staff",
      name: "견습 지팡이",
      type: "staff",
      slot: "weapon",
      rarity: "common",
      price: 134,
      description: "마법 계열이 사용하는 마도 지팡이. 긴 사거리와 마법 화력을 지원한다.",
      might: 5,
      hit: 90,
      rangeMin: 1,
      rangeMax: 3,
      uses: 30
    },
    {
      id: "shop-combat-wand",
      name: "전투 완드",
      type: "wand",
      slot: "weapon",
      rarity: "uncommon",
      price: 138,
      description: "빠른 마력 유도에 특화된 완드.",
      might: 4,
      hit: 94,
      rangeMin: 1,
      rangeMax: 2,
      uses: 34
    },
    {
      id: "shop-sealed-tome",
      name: "봉인 고서",
      type: "tome",
      slot: "weapon",
      rarity: "rare",
      price: 154,
      description: "안정적인 마력 증폭을 제공하는 고서.",
      might: 5,
      hit: 90,
      rangeMin: 1,
      rangeMax: 2,
      uses: 32
    },
    {
      id: "shop-rift-grimoire",
      name: "균열 마도서",
      type: "grimoire",
      slot: "weapon",
      rarity: "rare",
      price: 168,
      description: "긴 사거리와 높은 위력을 가진 마도서.",
      might: 6,
      hit: 86,
      rangeMin: 1,
      rangeMax: 3,
      uses: 28
    },
    {
      id: "shop-sanctified-focus",
      name: "축성 성구",
      type: "focus",
      slot: "weapon",
      rarity: "uncommon",
      price: 146,
      description: "마법 계열이 사용하는 성광 촉매. 회복과 성광 마법 운용을 돕는다.",
      might: 4,
      hit: 92,
      rangeMin: 1,
      rangeMax: 2,
      uses: 32
    },
    {
      id: "shop-handaxe-kit",
      name: "손도끼 보급품",
      type: "handaxe",
      slot: "weapon",
      rarity: "uncommon",
      price: 144,
      description: "가볍게 던지거나 찍어누를 수 있는 손도끼 계열 무기.",
      might: 6,
      hit: 80,
      rangeMin: 1,
      rangeMax: 2,
      uses: 30
    },
    {
      id: "shop-battleaxe-kit",
      name: "전투도끼 보급품",
      type: "battleaxe",
      slot: "weapon",
      rarity: "rare",
      price: 154,
      description: "균형 잡힌 위력의 전투도끼 계열 무기.",
      might: 8,
      hit: 76,
      rangeMin: 1,
      rangeMax: 1,
      uses: 32
    },
    {
      id: "shop-greataxe-kit",
      name: "대도끼 보급품",
      type: "greataxe",
      slot: "weapon",
      rarity: "rare",
      price: 170,
      description: "아주 무겁지만 압도적인 일격을 주는 대도끼.",
      might: 10,
      hit: 70,
      rangeMin: 1,
      rangeMax: 1,
      uses: 26
    },
    {
      id: "shop-vanguard-helm",
      name: "선봉 투구",
      type: "helmet",
      slot: "head",
      rarity: "uncommon",
      price: 96,
      description: "머리를 보호하며 방어와 체력을 높인다.",
      statBonus: { def: 1, maxHp: 2 }
    },
    {
      id: "shop-command-mantle",
      name: "지휘 견갑",
      type: "shoulder_guard",
      slot: "shoulder",
      rarity: "rare",
      price: 132,
      description: "어깨를 감싸며 힘을 보탠다.",
      statBonus: { str: 1, def: 1 }
    },
    {
      id: "shop-scout-coat",
      name: "정찰 외투",
      type: "armor",
      slot: "chest",
      rarity: "uncommon",
      price: 118,
      description: "가볍지만 실전적인 상의.",
      statBonus: { maxHp: 2, spd: 1 }
    },
    {
      id: "shop-ranger-greaves",
      name: "레인저 각반",
      type: "leggings",
      slot: "legs",
      rarity: "uncommon",
      price: 104,
      description: "기동성을 챙겨 주는 하의 장비.",
      statBonus: { skl: 1, spd: 1 }
    },
    {
      id: "shop-pathfinder-boots",
      name: "개척자 부츠",
      type: "boots",
      slot: "boots",
      rarity: "rare",
      price: 145,
      description: "이동력을 높여 주는 전투화.",
      statBonus: { mov: 1, spd: 1 }
    },
    {
      id: "shop-war-bracelet",
      name: "전투 팔찌",
      type: "bracelet",
      slot: "bracelet",
      rarity: "rare",
      price: 138,
      description: "힘과 체력을 동시에 높이는 팔찌.",
      statBonus: { str: 1, maxHp: 2 }
    },
    {
      id: "shop-precision-ring",
      name: "정밀 반지",
      type: "ring",
      slot: "ring",
      rarity: "rare",
      price: 148,
      description: "정확도와 속도를 끌어올리는 반지.",
      statBonus: { skl: 2, spd: 1 }
    },
    {
      id: "shop-guardian-shield",
      name: "수호 방패",
      type: "shield",
      slot: "subweapon",
      rarity: "rare",
      price: 162,
      description: "보조무기로 장착하는 방패.",
      statBonus: { def: 2, maxHp: 2 }
    },
    {
      id: "shop-ranger-quiver",
      name: "레인저 화살통",
      type: "quiver",
      slot: "subweapon",
      rarity: "rare",
      price: 154,
      description: "활과 석궁 계열 주무기와 함께 쓰는 보조 화살통.",
      primaryStatBonus: { dex: 1 },
      hiddenBonus: { accuracy: 5, critChance: 0.02 }
    },
    {
      id: "shop-arcane-orb",
      name: "비전 마도구",
      type: "arcane_orb",
      slot: "subweapon",
      rarity: "rare",
      price: 166,
      description: "메이지 계열이 지팡이, 완드, 마도서와 함께 쓰는 보조 마도구.",
      primaryStatBonus: { int: 1 },
      hiddenBonus: { magicAttack: 3, maxMana: 5 }
    },
    {
      id: "shop-holy-relic",
      name: "축성 성유물",
      type: "holy_relic",
      slot: "subweapon",
      rarity: "rare",
      price: 168,
      description: "클레릭 계열이 성구와 함께 쓰는 보조 성유물.",
      primaryStatBonus: { int: 1 },
      hiddenBonus: { healPower: 2, magicDefense: 2, maxMana: 4 }
    },
    {
      id: "shop-guardian-charm",
      name: "수호 부적",
      type: "charm",
      slot: "charm",
      rarity: "rare",
      price: 160,
      description: "방어와 기량을 높여 주는 부적.",
      statBonus: { def: 1, skl: 1 }
    }
  ];

  const AFFIX_COUNT_BY_RARITY = {
    common: [0, 1],
    uncommon: [1, 2],
    rare: [2, 3],
    unique: [3, 4],
    legendary: [4, 5],
    epic: [5, 5],
    mystic: [5, 6],
    primordial: [6, 6]
  };

  const ITEM_AFFIXES = [
    {
      id: "mighty",
      prefix: "강인한",
      family: "power",
      slotWeights: { weapon: 6, subweapon: 2, chest: 2, bracelet: 1, ring: 1 },
      primaryStatBonus: { str: 1 },
      hiddenBonus: { physicalAttack: 2 }
    },
    {
      id: "keen",
      prefix: "예리한",
      family: "precision",
      slotWeights: { weapon: 4, head: 2, bracelet: 3, ring: 2, boots: 1 },
      primaryStatBonus: { dex: 1 },
      hiddenBonus: { accuracy: 5 }
    },
    {
      id: "sturdy",
      prefix: "견고한",
      family: "guard",
      slotWeights: { chest: 6, shoulder: 5, head: 4, subweapon: 4, legs: 2 },
      primaryStatBonus: { vit: 1 },
      hiddenBonus: { physicalDefense: 2 }
    },
    {
      id: "wise",
      prefix: "현명한",
      family: "sage",
      slotWeights: { weapon: 2, charm: 5, ring: 4, bracelet: 3, head: 2 },
      primaryStatBonus: { int: 1 },
      hiddenBonus: { skillPower: 2, healPower: 1, magicAttack: 2, maxMana: 4 }
    },
    {
      id: "mystic",
      prefix: "마도",
      family: "arcane",
      tags: ["magic"],
      forbiddenTags: ["physical"],
      slotWeights: { weapon: 5, charm: 4, ring: 3, bracelet: 2 },
      primaryStatBonus: { int: 1 },
      hiddenBonus: { magicAttack: 3, maxMana: 5 }
    },
    {
      id: "lucky",
      prefix: "행운의",
      family: "fortune",
      slotWeights: { ring: 6, bracelet: 4, charm: 4, boots: 2 },
      primaryStatBonus: { luk: 1 },
      hiddenBonus: { critChance: 2, dropRateBonus: 0.01, lootQualityBonus: 0.006 }
    },
    {
      id: "ferocity",
      suffix: "맹공",
      family: "ferocity",
      weaponOnly: true,
      tags: ["physical"],
      forbiddenTags: ["magic"],
      slotWeights: { weapon: 7 },
      weaponBonus: { might: 1 },
      hiddenBonus: { physicalAttack: 1 }
    },
    {
      id: "precision",
      suffix: "정조준",
      family: "marksman",
      weaponOnly: true,
      slotWeights: { weapon: 6, head: 2, bracelet: 2 },
      weaponBonus: { hit: 4 },
      hiddenBonus: { accuracy: 4 }
    },
    {
      id: "endurance",
      suffix: "내구",
      family: "endurance",
      weaponOnly: true,
      slotWeights: { weapon: 5, subweapon: 3 },
      weaponBonus: { uses: 4 }
    },
    {
      id: "guard",
      suffix: "수호",
      family: "bulwark",
      slotWeights: { chest: 5, shoulder: 5, subweapon: 4, head: 3 },
      hiddenBonus: { physicalDefense: 3, evasion: 2 }
    },
    {
      id: "focus",
      suffix: "집중",
      family: "focus",
      slotWeights: { weapon: 4, gloves: 0, head: 2, bracelet: 3, ring: 2, charm: 2 },
      hiddenBonus: { skillPower: 2, magicAttack: 2, accuracy: 3 }
    },
    {
      id: "warding",
      suffix: "보호술",
      family: "ward",
      slotWeights: { head: 4, shoulder: 3, charm: 4, ring: 2 },
      hiddenBonus: { magicDefense: 3, manaRegen: 1 }
    },
    {
      id: "swiftness",
      suffix: "질풍",
      family: "swiftness",
      slotWeights: { boots: 6, legs: 3, bracelet: 2 },
      primaryStatBonus: { dex: 1 },
      hiddenBonus: { evasion: 4 }
    },
    {
      id: "fortune",
      suffix: "개척",
      family: "prosperity",
      slotWeights: { ring: 6, bracelet: 5, charm: 5 },
      hiddenBonus: { dropRateBonus: 0.015, lootQualityBonus: 0.01, critChance: 1 }
    },
    {
      id: "slayer",
      suffix: "학살",
      family: "slayer",
      tags: ["physical"],
      forbiddenTags: ["magic"],
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 6, bracelet: 3, ring: 2 },
      hiddenBonus: { physicalDamagePercent: 0.05, bossDamagePercent: 0.04 }
    },
    {
      id: "arcane_surge",
      suffix: "비전파",
      family: "arcane_surge",
      tags: ["magic"],
      forbiddenTags: ["physical"],
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 6, charm: 4, ring: 3 },
      hiddenBonus: { magicDamagePercent: 0.06, cooldownReduction: 1 }
    },
    {
      id: "opening",
      suffix: "선봉",
      family: "opening",
      allowedRarities: ["uncommon", "rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, boots: 3, bracelet: 2 },
      hiddenBonus: { firstStrikeDamagePercent: 0.08 }
    },
    {
      id: "relentless",
      suffix: "연격",
      family: "combo",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, bracelet: 3, ring: 2 },
      hiddenBonus: { comboStrikeDamagePercent: 0.08 }
    },
    {
      id: "riposte",
      suffix: "반격",
      family: "riposte",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { subweapon: 6, shoulder: 4, chest: 3, weapon: 2 },
      hiddenBonus: { counterDamagePercent: 0.1, blockChance: 0.04 }
    },
    {
      id: "vital",
      prefix: "생명",
      family: "vitality",
      slotWeights: { chest: 6, legs: 4, shoulder: 3, head: 3 },
      primaryStatBonus: { vit: 2 },
      legacyStatBonus: { maxHp: 3 }
    },
    {
      id: "adamant",
      prefix: "금강",
      family: "adamant",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { chest: 6, shoulder: 5, subweapon: 4, head: 3 },
      hiddenBonus: { damageReductionPercent: 0.04, blockChance: 0.04 }
    },
    {
      id: "purifying",
      suffix: "정화",
      family: "purify",
      slotWeights: { head: 6, charm: 5, ring: 3, shoulder: 2 },
      hiddenBonus: { statusResistChance: 0.08, magicDefense: 2 }
    },
    {
      id: "channeling",
      suffix: "축마",
      family: "channeling",
      tags: ["magic"],
      forbiddenTags: ["physical"],
      slotWeights: { head: 4, charm: 6, ring: 4, bracelet: 3 },
      hiddenBonus: { maxMana: 6, manaRegen: 1, magicAttack: 2 }
    },
    {
      id: "quickcast",
      suffix: "속성",
      family: "quickcast",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { charm: 5, ring: 5, bracelet: 4, head: 3 },
      hiddenBonus: { cooldownReduction: 1, skillPower: 2 }
    },
    {
      id: "strider",
      prefix: "질주의",
      family: "strider",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { boots: 7, legs: 4, bracelet: 2 },
      legacyStatBonus: { mov: 1 },
      hiddenBonus: { evasion: 3 }
    },
    {
      id: "eagle_eye",
      suffix: "독안",
      family: "eagle_eye",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, head: 4, bracelet: 3, ring: 2 },
      hiddenBonus: { accuracy: 6 }
    },
    {
      id: "bloodletter",
      suffix: "혈흔",
      family: "bleed",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["status"],
      slotWeights: { weapon: 6, bracelet: 4, ring: 2 },
      hiddenBonus: { bleedChance: 0.1, statusTargetDamagePercent: 0.06 }
    },
    {
      id: "emberbrand",
      suffix: "열화",
      family: "burn",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["status"],
      slotWeights: { weapon: 5, charm: 3, bracelet: 3 },
      hiddenBonus: { burnChance: 0.1, magicDamagePercent: 0.04 }
    },
    {
      id: "venomous",
      suffix: "맹독",
      family: "poison",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["status"],
      slotWeights: { weapon: 5, ring: 4, bracelet: 3 },
      hiddenBonus: { poisonChance: 0.1, statusDurationBonus: 0.1 }
    },
    {
      id: "frostbound",
      suffix: "서리",
      family: "freeze",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["status", "magic"],
      forbiddenTags: ["physical"],
      slotWeights: { weapon: 4, charm: 4, ring: 3 },
      hiddenBonus: { freezeChance: 0.08, magicDamagePercent: 0.04 }
    },
    {
      id: "skirmish",
      suffix: "유격",
      family: "skirmish",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { boots: 6, weapon: 3, bracelet: 2 },
      hiddenBonus: { moveThenAttackDamagePercent: 0.1 }
    },
    {
      id: "desperado",
      suffix: "배수",
      family: "desperado",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 4, chest: 3, ring: 3 },
      hiddenBonus: { lowHpAttackPercent: 0.12 }
    },
    {
      id: "executioner",
      suffix: "처형",
      family: "executioner",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, ring: 3, bracelet: 2 },
      hiddenBonus: { executeDamagePercent: 0.1 }
    },
    {
      id: "ironwall",
      prefix: "철벽의",
      family: "ironwall",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { chest: 6, shoulder: 5, subweapon: 4, head: 3, legs: 2 },
      hiddenBonus: { physicalDefense: 4, magicDefense: 2, damageReductionPercent: 0.03 }
    },
    {
      id: "watchguard",
      prefix: "경계의",
      family: "watchguard",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { head: 5, shoulder: 5, chest: 4, subweapon: 4, ring: 2 },
      hiddenBonus: { rangedDefense: 4, rangedDamageReductionPercent: 0.08, accuracy: 3 }
    },
    {
      id: "siphon",
      suffix: "흡혈",
      family: "siphon",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["physical"],
      forbiddenTags: ["magic"],
      slotWeights: { weapon: 6, bracelet: 4, ring: 2 },
      hiddenBonus: { lifeStealPercent: 0.06, physicalAttack: 2 }
    },
    {
      id: "soulreap",
      suffix: "영혼수확",
      family: "soulreap",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, charm: 4, ring: 3 },
      hiddenBonus: { killHealFlat: 5, executeDamagePercent: 0.08 }
    },
    {
      id: "bounty",
      prefix: "현상금의",
      family: "bounty",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { ring: 6, charm: 5, bracelet: 4, weapon: 2 },
      hiddenBonus: { monsterGoldBonus: 0.18, dropRateBonus: 0.01, lootQualityBonus: 0.006 }
    },
    {
      id: "marauder",
      suffix: "약탈",
      family: "marauder",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 4, boots: 4, bracelet: 3 },
      hiddenBonus: { monsterGoldBonus: 0.12, moveThenAttackDamagePercent: 0.08 }
    },
    {
      id: "ambush",
      suffix: "기습",
      family: "ambush",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 5, boots: 3, ring: 2, bracelet: 2 },
      hiddenBonus: { firstStrikeDamagePercent: 0.1, critChance: 0.03 }
    },
    {
      id: "duelist",
      prefix: "결투의",
      family: "duelist",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { weapon: 4, bracelet: 4, ring: 4, boots: 2 },
      hiddenBonus: { accuracy: 4, evasion: 3, critChance: 0.02 }
    },
    {
      id: "soulcurrent",
      suffix: "마력순환",
      family: "soulcurrent",
      tags: ["magic"],
      forbiddenTags: ["physical"],
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { charm: 6, ring: 4, bracelet: 3, head: 2 },
      hiddenBonus: { maxMana: 8, manaRegen: 2, cooldownReduction: 1 }
    },
    {
      id: "citadel",
      prefix: "성채의",
      family: "citadel",
      allowedRarities: ["rare", "unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { chest: 5, shoulder: 5, subweapon: 4, head: 3 },
      hiddenBonus: { physicalDefense: 3, rangedDefense: 3, blockChance: 0.04 }
    },
    {
      id: "plaguecall",
      suffix: "역병",
      family: "plaguecall",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      tags: ["status"],
      slotWeights: { weapon: 4, charm: 4, ring: 3, bracelet: 3 },
      hiddenBonus: { poisonChance: 0.08, burnChance: 0.08, statusDurationBonus: 0.08 }
    },
    {
      id: "overdrive",
      suffix: "가속",
      family: "overdrive",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { boots: 4, bracelet: 3, ring: 3, weapon: 2 },
      hiddenBonus: { comboStrikeDamagePercent: 0.08, moveThenAttackDamagePercent: 0.08, evasion: 2 }
    },
    {
      id: "revenant",
      prefix: "불사자의",
      family: "revenant",
      allowedRarities: ["unique", "legendary", "epic", "mystic", "primordial"],
      slotWeights: { chest: 4, ring: 4, bracelet: 2, charm: 2 },
      hiddenBonus: { lowHpAttackPercent: 0.1, killHealFlat: 4, damageReductionPercent: 0.03 }
    }
  ];

  const LEGENDARY_UNIQUE_AFFIXES = [
    {
      id: "sunbreaker_vow",
      suffix: "태양단절",
      family: "legendary_unique",
      allowedSlots: ["weapon"],
      tags: ["physical"],
      hiddenBonus: { bossDamagePercent: 0.16, firstStrikeDamagePercent: 0.12, critDamageBonus: 0.18 }
    },
    {
      id: "starwell_engine",
      suffix: "성정기관",
      family: "legendary_unique",
      allowedSlots: ["weapon", "charm", "ring"],
      tags: ["magic"],
      hiddenBonus: { magicDamagePercent: 0.16, maxMana: 12, manaRegen: 2, cooldownReduction: 1 }
    },
    {
      id: "aegis_heartbeat",
      suffix: "수호심장",
      family: "legendary_unique",
      allowedSlots: ["chest", "shoulder", "subweapon"],
      hiddenBonus: { damageReductionPercent: 0.1, blockChance: 0.12, counterDamagePercent: 0.14 }
    },
    {
      id: "hunters_march",
      suffix: "사냥행군",
      family: "legendary_unique",
      allowedSlots: ["boots", "weapon", "bracelet"],
      hiddenBonus: { moveThenAttackDamagePercent: 0.14 },
      legacyStatBonus: { mov: 1 }
    },
    {
      id: "nightbloom_hex",
      suffix: "야화주문",
      family: "legendary_unique",
      allowedSlots: ["weapon", "ring", "bracelet", "charm"],
      tags: ["status"],
      hiddenBonus: { bleedChance: 0.12, burnChance: 0.12, poisonChance: 0.12, statusTargetDamagePercent: 0.14 }
    },
    {
      id: "scarlet_feast",
      suffix: "적혈갈망",
      family: "legendary_unique",
      allowedSlots: ["weapon", "bracelet", "ring"],
      tags: ["physical"],
      hiddenBonus: { lifeStealPercent: 0.12, killHealFlat: 8, executeDamagePercent: 0.12 }
    },
    {
      id: "horizon_bulwark",
      suffix: "천궁방벽",
      family: "legendary_unique",
      allowedSlots: ["chest", "shoulder", "subweapon", "head"],
      hiddenBonus: { rangedDefense: 6, rangedDamageReductionPercent: 0.16, damageReductionPercent: 0.08 }
    },
    {
      id: "gilded_fang",
      suffix: "황금송곳니",
      family: "legendary_unique",
      allowedSlots: ["weapon", "ring", "charm"],
      hiddenBonus: { monsterGoldBonus: 0.35, dropRateBonus: 0.04, lootQualityBonus: 0.02, critChance: 0.04 }
    }
  ];

  const SET_DEFINITIONS = {
    dawn_guard: {
      name: "여명 기사단",
      bonuses: [
        { pieces: 2, hiddenBonus: { firstStrikeDamagePercent: 0.08, blockChance: 0.06 }, description: "선공 피해와 막기 확률이 오른다." },
        { pieces: 3, primaryStatBonus: { str: 2, vit: 2 }, hiddenBonus: { bossDamagePercent: 0.08 }, description: "STR/VIT와 보스 피해가 오른다." },
        { pieces: 4, hiddenBonus: { damageReductionPercent: 0.08, critDamageBonus: 0.12 }, description: "피해 감소와 치명 피해가 크게 오른다." }
      ]
    },
    starweave: {
      name: "성운 직조",
      bonuses: [
        { pieces: 2, hiddenBonus: { magicDamagePercent: 0.1, maxMana: 10 }, description: "마법 피해와 최대 마나가 오른다." },
        { pieces: 3, primaryStatBonus: { int: 3 }, hiddenBonus: { cooldownReduction: 1, manaRegen: 2 }, description: "INT, 쿨감, 마나 회복이 오른다." },
        { pieces: 4, hiddenBonus: { statusTargetDamagePercent: 0.1, freezeChance: 0.1 }, description: "상태이상 적 피해와 빙결 확률이 오른다." }
      ]
    },
    sanctuary: {
      name: "성역 순례",
      bonuses: [
        { pieces: 2, hiddenBonus: { healPower: 4, magicDefense: 4 }, description: "회복력과 마방이 오른다." },
        { pieces: 3, primaryStatBonus: { int: 2, luk: 2 }, hiddenBonus: { statusResistChance: 0.12 }, description: "INT/LUK와 상태 저항이 오른다." },
        { pieces: 4, hiddenBonus: { damageReductionPercent: 0.08, magicDamagePercent: 0.08 }, description: "피해 감소와 성속성 마도 화력이 오른다." }
      ]
    },
    windrider: {
      name: "질풍 추격",
      bonuses: [
        { pieces: 2, hiddenBonus: { accuracy: 8, critChance: 0.06 }, description: "명중과 치명 확률이 오른다." },
        { pieces: 3, legacyStatBonus: { mov: 1 }, hiddenBonus: { moveThenAttackDamagePercent: 0.12 }, description: "이동력과 이동 후 공격 피해가 오른다." },
        { pieces: 4, hiddenBonus: { executeDamagePercent: 0.12 }, description: "마무리 피해가 오른다." }
      ]
    }
  };

  const SET_ITEM_TEMPLATES = [
    {
      id: "set-dawn-guard-blade",
      setId: "dawn_guard",
      name: "여명 기사단의 장검",
      rarity: "legendary",
      slot: "weapon",
      type: "sword",
      minLevel: 10,
      base: { might: 8, hit: 90, rangeMin: 1, rangeMax: 1, uses: 36 },
      primaryStatBonus: { str: 2, vit: 1 },
      hiddenBonus: { firstStrikeDamagePercent: 0.08 }
    },
    {
      id: "set-dawn-guard-helm",
      setId: "dawn_guard",
      name: "여명 기사단의 투구",
      rarity: "legendary",
      slot: "head",
      type: "helmet",
      minLevel: 10,
      primaryStatBonus: { vit: 2 },
      hiddenBonus: { blockChance: 0.05, accuracy: 4 }
    },
    {
      id: "set-dawn-guard-armor",
      setId: "dawn_guard",
      name: "여명 기사단의 흉갑",
      rarity: "legendary",
      slot: "chest",
      type: "armor",
      minLevel: 10,
      primaryStatBonus: { vit: 2 },
      statBonus: { maxHp: 4, def: 2 },
      hiddenBonus: { damageReductionPercent: 0.04 }
    },
    {
      id: "set-dawn-guard-ring",
      setId: "dawn_guard",
      name: "여명 서약 반지",
      rarity: "epic",
      slot: "ring",
      type: "ring",
      minLevel: 12,
      primaryStatBonus: { str: 1, vit: 1 },
      hiddenBonus: { bossDamagePercent: 0.05 }
    },
    {
      id: "set-starweave-staff",
      setId: "starweave",
      name: "성운 직조의 마도지팡이",
      rarity: "mystic",
      slot: "weapon",
      type: "staff",
      minLevel: 16,
      base: { might: 9, hit: 94, rangeMin: 1, rangeMax: 3, uses: 30 },
      primaryStatBonus: { int: 3 },
      hiddenBonus: { magicDamagePercent: 0.08, maxMana: 8 }
    },
    {
      id: "set-starweave-hood",
      setId: "starweave",
      name: "성운 직조의 후드",
      rarity: "epic",
      slot: "head",
      type: "hood",
      minLevel: 16,
      primaryStatBonus: { int: 2 },
      hiddenBonus: { manaRegen: 1, accuracy: 4 }
    },
    {
      id: "set-starweave-robe",
      setId: "starweave",
      name: "성운 직조의 예복",
      rarity: "mystic",
      slot: "chest",
      type: "robe",
      minLevel: 16,
      primaryStatBonus: { int: 2, vit: 1 },
      statBonus: { maxHp: 2 },
      hiddenBonus: { magicDefense: 4 }
    },
    {
      id: "set-starweave-charm",
      setId: "starweave",
      name: "성운 직조의 성흔",
      rarity: "legendary",
      slot: "charm",
      type: "charm",
      minLevel: 18,
      primaryStatBonus: { int: 2, luk: 1 },
      hiddenBonus: { cooldownReduction: 1, freezeChance: 0.06 }
    },
    {
      id: "set-sanctuary-focus",
      setId: "sanctuary",
      name: "성역 순례의 성구",
      rarity: "legendary",
      slot: "weapon",
      type: "focus",
      minLevel: 12,
      base: { might: 7, hit: 95, rangeMin: 1, rangeMax: 2, uses: 34 },
      primaryStatBonus: { int: 2, luk: 1 },
      hiddenBonus: { healPower: 3, magicDamagePercent: 0.05 }
    },
    {
      id: "set-sanctuary-mantle",
      setId: "sanctuary",
      name: "성역 순례의 망토",
      rarity: "epic",
      slot: "shoulder",
      type: "mantle",
      minLevel: 12,
      primaryStatBonus: { vit: 1, int: 1 },
      hiddenBonus: { magicDefense: 3, statusResistChance: 0.06 }
    },
    {
      id: "set-sanctuary-bracelet",
      setId: "sanctuary",
      name: "성역 순례의 팔찌",
      rarity: "legendary",
      slot: "bracelet",
      type: "bracelet",
      minLevel: 14,
      primaryStatBonus: { int: 1, luk: 1 },
      hiddenBonus: { healPower: 2, manaRegen: 1 }
    },
    {
      id: "set-sanctuary-ring",
      setId: "sanctuary",
      name: "성역 순례의 반지",
      rarity: "legendary",
      slot: "ring",
      type: "ring",
      minLevel: 14,
      primaryStatBonus: { luk: 2 },
      hiddenBonus: { dropRateBonus: 0.02, lootQualityBonus: 0.01 }
    },
    {
      id: "set-windrider-bow",
      setId: "windrider",
      name: "질풍 추격의 활",
      rarity: "legendary",
      slot: "weapon",
      type: "bow",
      minLevel: 10,
      base: { might: 7, hit: 94, rangeMin: 2, rangeMax: 2, uses: 32 },
      primaryStatBonus: { dex: 2 },
      hiddenBonus: { critChance: 0.05, accuracy: 5 }
    },
    {
      id: "set-windrider-leggings",
      setId: "windrider",
      name: "질풍 추격의 경갑",
      rarity: "epic",
      slot: "legs",
      type: "leggings",
      minLevel: 10,
      primaryStatBonus: { dex: 1, vit: 1 },
      hiddenBonus: { evasion: 5 }
    },
    {
      id: "set-windrider-boots",
      setId: "windrider",
      name: "질풍 추격의 장화",
      rarity: "legendary",
      slot: "boots",
      type: "boots",
      minLevel: 10,
      primaryStatBonus: { dex: 1 },
      statBonus: { mov: 1 },
      hiddenBonus: { moveThenAttackDamagePercent: 0.08 }
    },
    {
      id: "set-windrider-bracelet",
      setId: "windrider",
      name: "질풍 추격의 표식팔찌",
      rarity: "legendary",
      slot: "bracelet",
      type: "bracelet",
      minLevel: 12,
      primaryStatBonus: { dex: 1, luk: 1 },
      hiddenBonus: { executeDamagePercent: 0.08, critChance: 0.04 }
    }
  ];

  function clone(value) {
    return StorageService.cloneValue(value);
  }

  function getStatsService() {
    return global.StatsService || null;
  }

  function roundHiddenBonus(statName, value) {
    if (PERCENT_HIDDEN_BONUS_KEYS.has(statName)) {
      return Number(Number(value || 0).toFixed(3));
    }

    return Math.round(value || 0);
  }

  function isPercentHiddenBonus(statName) {
    return PERCENT_HIDDEN_BONUS_KEYS.has(statName);
  }

  function hasAnyBonus(bonusMap) {
    return !!bonusMap && Object.keys(bonusMap).some((key) => Number(bonusMap[key] || 0) !== 0);
  }

  function addBonusMaps(target, source, normalizer) {
    const nextTarget = target || {};

    Object.keys(source || {}).forEach((key) => {
      const nextValue = Number(nextTarget[key] || 0) + Number(source[key] || 0);
      nextTarget[key] = normalizer ? normalizer(key, nextValue) : nextValue;
    });

    return nextTarget;
  }

  function createPrimaryBonusMap() {
    return {
      str: 0,
      dex: 0,
      vit: 0,
      int: 0,
      luk: 0
    };
  }

  function createLegacyBonusMap() {
    return {
      maxHp: 0,
      str: 0,
      skl: 0,
      spd: 0,
      def: 0,
      mov: 0
    };
  }

  function createHiddenBonusMap() {
    return {
      physicalAttack: 0,
      skillPower: 0,
      healPower: 0,
      magicAttack: 0,
      magicDefense: 0,
      maxMana: 0,
      manaRegen: 0,
      accuracy: 0,
      evasion: 0,
      physicalDefense: 0,
      rangedDefense: 0,
      critChance: 0,
      critDamageBonus: 0,
      physicalDamagePercent: 0,
      magicDamagePercent: 0,
      bossDamagePercent: 0,
      firstStrikeDamagePercent: 0,
      comboStrikeDamagePercent: 0,
      counterDamagePercent: 0,
      damageReductionPercent: 0,
      rangedDamageReductionPercent: 0,
      blockChance: 0,
      statusResistChance: 0,
      cooldownReduction: 0,
      goldGainBonus: 0,
      monsterGoldBonus: 0,
      lifeStealPercent: 0,
      killHealFlat: 0,
      rangeBonus: 0,
      bleedChance: 0,
      burnChance: 0,
      poisonChance: 0,
      freezeChance: 0,
      statusDurationBonus: 0,
      statusTargetDamagePercent: 0,
      moveThenAttackDamagePercent: 0,
      lowHpAttackPercent: 0,
      executeDamagePercent: 0,
      dropRateBonus: 0,
      lootQualityBonus: 0
    };
  }

  function createWeaponBonusMap() {
    return {
      might: 0,
      hit: 0,
      uses: 0
    };
  }

  function clampPrimaryBonus(statName, value) {
    return Math.max(0, Math.round(value || 0));
  }

  function getRarityIndex(rarity) {
    return Math.max(0, RARITY_ORDER.indexOf(rarity));
  }

  function getRandomIntInclusive(min, max) {
    return min + Math.floor(Math.random() * ((max - min) + 1));
  }

  function scalePrimaryBonusMap(baseBonus, rarityIndex, level) {
    const levelBonus = Math.max(0, Number(level || 1) - 1);
    const scaled = createPrimaryBonusMap();

    Object.keys(baseBonus || {}).forEach((statName) => {
      const baseValue = Number(baseBonus[statName] || 0);
      const growth = Math.floor((rarityIndex + levelBonus) / 5);
      scaled[statName] = clampPrimaryBonus(statName, baseValue + growth);
    });

    return scaled;
  }

  function scaleHiddenBonusMap(baseBonus, rarityIndex, level) {
    const levelBonus = Math.max(0, Number(level || 1) - 1);
    const scaled = createHiddenBonusMap();

    Object.keys(baseBonus || {}).forEach((statName) => {
      const baseValue = Number(baseBonus[statName] || 0);
      const growth = isPercentHiddenBonus(statName)
        ? (rarityIndex * 0.003) + (Math.min(10, levelBonus) * 0.0007)
        : Math.floor((rarityIndex + levelBonus) / 3);
      scaled[statName] = roundHiddenBonus(statName, baseValue + growth);
    });

    return scaled;
  }

  function scaleLegacyBonusMap(baseBonus, rarityIndex, level) {
    const levelBonus = Math.max(0, Number(level || 1) - 1);
    const scaled = createLegacyBonusMap();

    Object.keys(baseBonus || {}).forEach((statName) => {
      const baseValue = Number(baseBonus[statName] || 0);
      const growth = statName === "maxHp"
        ? Math.floor((rarityIndex + levelBonus) / 4)
        : Math.floor((rarityIndex + levelBonus) / 6);
      scaled[statName] = Math.max(0, Math.round(baseValue + growth));
    });

    return scaled;
  }

  function scaleWeaponBonusMap(baseBonus, rarityIndex, level) {
    const levelBonus = Math.max(0, Number(level || 1) - 1);
    const scaled = createWeaponBonusMap();

    Object.keys(baseBonus || {}).forEach((statName) => {
      const baseValue = Number(baseBonus[statName] || 0);
      const growth = Math.floor((rarityIndex + levelBonus) / 3);
      scaled[statName] = Math.max(0, Math.round(baseValue + growth));
    });

    return scaled;
  }

  function buildAffixDescription(affix) {
    const parts = [];

    Object.keys(affix.primaryStatBonus || {}).forEach((statName) => {
      if (affix.primaryStatBonus[statName]) {
        parts.push(`${PRIMARY_STAT_LABELS[statName]} +${affix.primaryStatBonus[statName]}`);
      }
    });

    Object.keys(affix.hiddenBonus || {}).forEach((statName) => {
      const value = affix.hiddenBonus[statName];

      if (!value) {
        return;
      }

      if (isPercentHiddenBonus(statName)) {
        parts.push(`${HIDDEN_BONUS_LABELS[statName]} +${Math.round(value * 100)}%`);
      } else {
        parts.push(`${HIDDEN_BONUS_LABELS[statName]} +${value}`);
      }
    });

    Object.keys(affix.legacyStatBonus || {}).forEach((statName) => {
      if (affix.legacyStatBonus[statName]) {
        parts.push(`${STAT_LABELS[statName]} +${affix.legacyStatBonus[statName]}`);
      }
    });

    Object.keys(affix.weaponBonus || {}).forEach((statName) => {
      if (affix.weaponBonus[statName]) {
        parts.push(`${statName === "might" ? "위력" : statName === "hit" ? "명중" : "내구"} +${affix.weaponBonus[statName]}`);
      }
    });

    return parts.join(" / ");
  }

  function sanitizeRangeBonusText(text) {
    return String(text || "")
      .split(" / ")
      .filter((part) => part && !part.startsWith("사거리 +"))
      .join(" / ");
  }

  function sanitizeItemRangeBonus(item) {
    if (!item) {
      return item;
    }

    if (item.hiddenBonus && Object.prototype.hasOwnProperty.call(item.hiddenBonus, "rangeBonus")) {
      item.hiddenBonus.rangeBonus = 0;
    }

    if (Array.isArray(item.affixes)) {
      item.affixes = item.affixes.map((affix) => Object.assign({}, affix, {
        description: sanitizeRangeBonusText(affix && affix.description)
      }));
    }

    item.hiddenBonus = hasAnyBonus(item.hiddenBonus) ? item.hiddenBonus : null;
    return item;
  }

  function chooseAffixCount(rarity) {
    const range = AFFIX_COUNT_BY_RARITY[rarity] || AFFIX_COUNT_BY_RARITY.common;
    return getRandomIntInclusive(range[0], range[1]);
  }

  function getAffixSlotKey(item) {
    if (!item) {
      return "misc";
    }

    if (item.slot === "weapon") {
      return "weapon";
    }

    if (item.slot === "subweapon") {
      return "subweapon";
    }

    if (item.slot === "bracelet" || item.slot === "ring" || item.slot === "charm") {
      return item.slot;
    }

    return item.slot || "misc";
  }

  function hasAffixConflict(candidate, selectedAffixes) {
    const selectedFamilies = new Set((selectedAffixes || []).map((affix) => affix.family).filter(Boolean));
    const selectedTags = new Set();

    (selectedAffixes || []).forEach((affix) => {
      (affix.tags || []).forEach((tag) => selectedTags.add(tag));
    });

    if (candidate.family && selectedFamilies.has(candidate.family)) {
      return true;
    }

    if ((candidate.forbiddenTags || []).some((tag) => selectedTags.has(tag))) {
      return true;
    }

    return (selectedAffixes || []).some((affix) => (affix.forbiddenTags || []).some((tag) => (candidate.tags || []).includes(tag)));
  }

  function getWeightedPoolEntry(template, slotKey) {
    const weights = template.slotWeights || {};
    return Number(weights[slotKey] || weights.default || 0);
  }

  function pickWeightedEntry(entries, slotKey) {
    const weightedEntries = entries
      .map((entry) => ({ entry, weight: getWeightedPoolEntry(entry, slotKey) }))
      .filter((entry) => entry.weight > 0);

    if (!weightedEntries.length) {
      return null;
    }

    const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < weightedEntries.length; index += 1) {
      roll -= weightedEntries[index].weight;

      if (roll <= 0) {
        return weightedEntries[index].entry;
      }
    }

    return weightedEntries[weightedEntries.length - 1].entry;
  }

  function chooseItemAffixes(item, rarity, level) {
    const rarityIndex = getRarityIndex(rarity);
    const desiredCount = chooseAffixCount(rarity);
    const slotKey = getAffixSlotKey(item);
    const pool = ITEM_AFFIXES.filter((affix) => {
      if (affix.weaponOnly && !isWeapon(item)) {
        return false;
      }

      if (Array.isArray(affix.allowedSlots) && !affix.allowedSlots.includes(item.slot)) {
        return false;
      }

      if (Array.isArray(affix.allowedRarities) && !affix.allowedRarities.includes(rarity)) {
        return false;
      }

      return getWeightedPoolEntry(affix, slotKey) > 0 || !affix.slotWeights;
    });
    const selected = [];

    while (pool.length && selected.length < desiredCount) {
      const candidatePool = pool.filter((affix) => !hasAffixConflict(affix, selected));
      const template = pickWeightedEntry(candidatePool, slotKey);

      if (!template) {
        break;
      }

      const templateIndex = pool.findIndex((affix) => affix.id === template.id);

      if (templateIndex >= 0) {
        pool.splice(templateIndex, 1);
      }

      const affix = {
        id: template.id,
        prefix: template.prefix || "",
        suffix: template.suffix || "",
        family: template.family || template.id,
        tags: (template.tags || []).slice(),
        forbiddenTags: (template.forbiddenTags || []).slice(),
        primaryStatBonus: scalePrimaryBonusMap(template.primaryStatBonus || {}, rarityIndex, level),
        hiddenBonus: scaleHiddenBonusMap(template.hiddenBonus || {}, rarityIndex, level),
        legacyStatBonus: scaleLegacyBonusMap(template.legacyStatBonus || {}, rarityIndex, level),
        weaponBonus: scaleWeaponBonusMap(template.weaponBonus || {}, rarityIndex, level)
      };

      affix.label = affix.prefix || affix.suffix || template.id;
      affix.description = buildAffixDescription(affix);
      selected.push(affix);
    }

    return selected;
  }

  function chooseUniqueAffix(item, rarity, level, selectedAffixes) {
    const rarityIndex = getRarityIndex(rarity);
    const uniqueChance = rarity === "legendary"
      ? 0.5
      : rarity === "epic"
        ? 0.65
        : rarity === "mystic"
          ? 0.8
          : rarity === "primordial"
            ? 1
            : 0;

    if (!uniqueChance || Math.random() > uniqueChance) {
      return null;
    }

    const slotKey = getAffixSlotKey(item);
    const template = pickWeightedEntry(
      LEGENDARY_UNIQUE_AFFIXES.filter((affix) => {
        if (Array.isArray(affix.allowedSlots) && !affix.allowedSlots.includes(item.slot)) {
          return false;
        }

        return !hasAffixConflict(affix, selectedAffixes || []);
      }).map((affix) => Object.assign({
        slotWeights: { [slotKey]: 1 }
      }, affix)),
      slotKey
    );

    if (!template) {
      return null;
    }

    const affix = {
      id: template.id,
      prefix: template.prefix || "",
      suffix: template.suffix || "",
      family: template.family || template.id,
      tags: (template.tags || []).slice(),
      forbiddenTags: (template.forbiddenTags || []).slice(),
      primaryStatBonus: scalePrimaryBonusMap(template.primaryStatBonus || {}, rarityIndex + 1, level),
      hiddenBonus: scaleHiddenBonusMap(template.hiddenBonus || {}, rarityIndex + 1, level),
      legacyStatBonus: scaleLegacyBonusMap(template.legacyStatBonus || {}, rarityIndex + 1, level),
      weaponBonus: scaleWeaponBonusMap(template.weaponBonus || {}, rarityIndex + 1, level)
    };

    affix.label = affix.prefix || affix.suffix || template.id;
    affix.description = buildAffixDescription(affix);
    affix.isUnique = true;
    return affix;
  }

  function getAffixTemplateById(affixId, isUnique) {
    const sourcePool = isUnique ? LEGENDARY_UNIQUE_AFFIXES : ITEM_AFFIXES;
    return sourcePool.find((template) => template.id === affixId) || null;
  }

  function hydrateAffixForNaming(item, affix) {
    if (!item || !affix || !affix.id) {
      return affix;
    }

    const template = getAffixTemplateById(affix.id, affix.isUnique);

    if (!template) {
      return affix;
    }

    const rarityIndex = getRarityIndex(item.rarity);
    const level = Number(item.level || rarityIndex + 1);
    const scalingIndex = affix.isUnique ? rarityIndex + 1 : rarityIndex;

    return Object.assign({}, affix, {
      prefix: template.prefix || "",
      suffix: template.suffix || "",
      primaryStatBonus: scalePrimaryBonusMap(template.primaryStatBonus || {}, scalingIndex, level),
      hiddenBonus: scaleHiddenBonusMap(template.hiddenBonus || {}, scalingIndex, level),
      legacyStatBonus: scaleLegacyBonusMap(template.legacyStatBonus || {}, scalingIndex, level),
      weaponBonus: scaleWeaponBonusMap(template.weaponBonus || {}, scalingIndex, level)
    });
  }

  function convertLegacyBonusToModern(statBonus) {
    const primaryStatBonus = createPrimaryBonusMap();
    const legacyStatBonus = createLegacyBonusMap();
    const source = statBonus || {};

    if (source.str) {
      primaryStatBonus.str += Number(source.str || 0);
    }

    if (source.skl) {
      primaryStatBonus.dex += Number(source.skl || 0);
    }

    if (source.spd) {
      primaryStatBonus.dex += Number(source.spd || 0);
    }

    if (source.def) {
      primaryStatBonus.vit += Number(source.def || 0);
    }

    if (source.maxHp) {
      primaryStatBonus.vit += Math.max(1, Math.floor((Number(source.maxHp || 0) + 1) / 2));
    }

    if (source.mov) {
      legacyStatBonus.mov += Number(source.mov || 0);
    }

    return {
      primaryStatBonus,
      legacyStatBonus
    };
  }

  function getAffixNameScore(affix) {
    let score = 0;

    Object.keys(affix.primaryStatBonus || {}).forEach((statName) => {
      score += Math.abs(Number(affix.primaryStatBonus[statName] || 0));
    });

    Object.keys(affix.hiddenBonus || {}).forEach((statName) => {
      const value = Math.abs(Number(affix.hiddenBonus[statName] || 0));
      score += isPercentHiddenBonus(statName) ? value * 100 : value;
    });

    Object.keys(affix.legacyStatBonus || {}).forEach((statName) => {
      score += Math.abs(Number(affix.legacyStatBonus[statName] || 0));
    });

    Object.keys(affix.weaponBonus || {}).forEach((statName) => {
      score += Math.abs(Number(affix.weaponBonus[statName] || 0));
    });

    if (affix.isUnique) {
      score += 0.25;
    }

    return score;
  }

  function getDominantNamingAffix(affixes) {
    return (affixes || [])
      .filter((affix) => affix && (affix.prefix || affix.suffix))
      .reduce((bestAffix, currentAffix) => {
        if (!bestAffix) {
          return currentAffix;
        }

        return getAffixNameScore(currentAffix) > getAffixNameScore(bestAffix)
          ? currentAffix
          : bestAffix;
      }, null);
  }

  function buildAffixedItemName(baseName, affixes) {
    const dominantAffix = getDominantNamingAffix(affixes);
    let name = baseName;

    if (!dominantAffix) {
      return name;
    }

    return dominantAffix.prefix
      ? `${dominantAffix.prefix} ${name}`
      : `${name} ${dominantAffix.suffix}`;
  }

  function getSetDefinition(setId) {
    return setId ? (SET_DEFINITIONS[setId] || null) : null;
  }

  function getSetBonusEntries(setId, pieceCount) {
    const definition = getSetDefinition(setId);

    if (!definition) {
      return [];
    }

    return (definition.bonuses || []).filter((bonus) => pieceCount >= bonus.pieces);
  }

  function buildSetSummaryLine(setId, pieceCount) {
    const definition = getSetDefinition(setId);

    if (!definition) {
      return "";
    }

    return `${definition.name} ${pieceCount}세트`;
  }

  function finalizeGeneratedEquipment(item, rarity, level, options) {
    if (!item || !isEquipment(item) || item.generatedAffixVersion) {
      return item;
    }

    const nextOptions = options || {};

    if (item.setId) {
      normalizeLegacyItem(item);
      item.baseName = item.baseName || item.name;
      item.setName = item.setName || (getSetDefinition(item.setId) && getSetDefinition(item.setId).name) || "";
      item.affixes = Array.isArray(item.affixes) ? item.affixes : [];
      item.generatedAffixVersion = 2;
      return item;
    }

    const affixes = chooseItemAffixes(item, rarity, level);

    while (affixes.length < Math.max(0, Number(nextOptions.minAffixCount || 0))) {
      const fillerAffix = chooseItemAffixes(item, rarity, level).find((candidate) => (
        !affixes.some((selected) => selected.id === candidate.id)
        && !hasAffixConflict(candidate, affixes)
      ));

      if (!fillerAffix) {
        break;
      }

      affixes.push(fillerAffix);
    }

    const uniqueAffix = chooseUniqueAffix(item, rarity, level, affixes);

    if (uniqueAffix) {
      affixes.push(uniqueAffix);
    }

    const primaryStatBonus = addBonusMaps(clone(item.primaryStatBonus || createPrimaryBonusMap()), {}, clampPrimaryBonus);
    const hiddenBonus = addBonusMaps(clone(item.hiddenBonus || createHiddenBonusMap()), {}, roundHiddenBonus);
    const weaponBonus = addBonusMaps(clone(item.weaponBonus || createWeaponBonusMap()), {}, null);
    const legacyStatBonus = addBonusMaps(clone(item.statBonus || createLegacyBonusMap()), {}, null);

    affixes.forEach((affix) => {
      addBonusMaps(primaryStatBonus, affix.primaryStatBonus || {}, clampPrimaryBonus);
      addBonusMaps(hiddenBonus, affix.hiddenBonus || {}, roundHiddenBonus);
      addBonusMaps(legacyStatBonus, affix.legacyStatBonus || {}, null);
      addBonusMaps(weaponBonus, affix.weaponBonus || {}, null);
    });

    item.baseName = item.baseName || item.name;
    item.affixes = affixes.map((affix) => ({
      id: affix.id,
      label: affix.label,
      description: affix.description,
      isUnique: !!affix.isUnique
    }));
    item.primaryStatBonus = hasAnyBonus(primaryStatBonus) ? primaryStatBonus : null;
    item.hiddenBonus = hasAnyBonus(hiddenBonus) ? hiddenBonus : null;
    item.statBonus = hasAnyBonus(legacyStatBonus) ? legacyStatBonus : null;
    item.weaponBonus = hasAnyBonus(weaponBonus) ? weaponBonus : null;
    item.name = affixes.length ? buildAffixedItemName(item.baseName, affixes) : item.baseName;

    if (isWeapon(item) && item.weaponBonus) {
      item.might += item.weaponBonus.might || 0;
      item.hit += item.weaponBonus.hit || 0;
      item.uses += item.weaponBonus.uses || 0;
    }

    item.generatedAffixVersion = 1;
    return item;
  }

  function getRarityMeta(rarity) {
    return RARITY_META[rarity] || RARITY_META.common;
  }

  function getClassWeaponTypes(className) {
    const baseTypes = CLASS_WEAPONS[className] || ["sword"];
    const proficiencyProfile = className ? CLASS_WEAPON_PROFICIENCY[className] : null;

    if (!proficiencyProfile) {
      return baseTypes;
    }

    const allowedFamilies = new Set(
      []
        .concat(proficiencyProfile.favoredFamilies || [])
        .concat(proficiencyProfile.toleratedFamilies || [])
        .filter(Boolean)
    );

    if (!allowedFamilies.size) {
      return baseTypes;
    }

    return baseTypes.filter((type) => allowedFamilies.has(getWeaponFamily(type)));
  }

  function getWeaponFamily(type) {
    return WEAPON_FAMILY_BY_TYPE[type] || "";
  }

  function getWeaponDiscipline(type) {
    if ((WEAPON_TYPES_BY_DISCIPLINE.magic || []).includes(type)) {
      return "magic";
    }

    if ((WEAPON_TYPES_BY_DISCIPLINE.physical || []).includes(type)) {
      return "physical";
    }

    return "";
  }

  function getWeaponEquipRule(type) {
    const rule = WEAPON_EQUIP_RULES[type] || {};
    return {
      offhandRoles: (rule.offhandRoles || []).slice(),
      offhandWeaponTypes: (rule.offhandWeaponTypes || []).slice()
    };
  }

  function getSubweaponRole(itemOrType) {
    const type = typeof itemOrType === "string"
      ? itemOrType
      : itemOrType && itemOrType.type;
    return SUBWEAPON_ROLE_BY_TYPE[type] || "";
  }

  function getClassSubweaponRoles(className) {
    return (CLASS_SUBWEAPON_ROLES[className] || []).slice();
  }

  function parseEquipArgs(arg1, arg2, arg3, arg4) {
    const looksLikeSaveData = !!arg1 && typeof arg1 === "object"
      && (Array.isArray(arg1.inventory) || Array.isArray(arg1.roster));

    if (typeof arg4 !== "undefined" || looksLikeSaveData) {
      return {
        saveData: looksLikeSaveData ? arg1 : null,
        unit: arg2,
        item: arg3,
        slotKey: arg4
      };
    }

    return {
      saveData: null,
      unit: arg1,
      item: arg2,
      slotKey: arg3
    };
  }

  function buildCandidateLoadout(saveData, unitId, item, targetSlotKey) {
    const loadout = {};

    EQUIP_SLOT_LAYOUT.forEach((entry) => {
      loadout[entry.key] = null;
    });

    if (saveData && unitId) {
      Object.assign(loadout, getEquipmentLoadout(saveData, unitId));
    }

    Object.keys(loadout).forEach((slotKey) => {
      if (loadout[slotKey] && item && loadout[slotKey].id === item.id) {
        loadout[slotKey] = null;
      }
    });

    if (targetSlotKey) {
      loadout[targetSlotKey] = item;
    }

    return loadout;
  }

  function getOffhandWeaponSupportBonus(item) {
    const hiddenBonus = createHiddenBonusMap();

    if (!item || item.slot !== "weapon" || item.equippedSlotKey !== "subweapon") {
      return hiddenBonus;
    }

    const discipline = getWeaponDiscipline(item.type);
    hiddenBonus.accuracy += Math.max(2, Math.floor(Number(item.hit || 0) / 24));

    if (discipline === "magic") {
      hiddenBonus.magicAttack += Math.max(1, Math.floor(Number(item.might || 0) / 3));
      hiddenBonus.skillPower += 1;
    } else {
      hiddenBonus.physicalAttack += Math.max(1, Math.floor(Number(item.might || 0) / 3));
      hiddenBonus.critChance += 0.01;
    }

    return hiddenBonus;
  }

  function canUseSubweaponRole(unit, role) {
    return !!role && getClassSubweaponRoles(unit && unit.className).includes(role);
  }

  function canWeaponUseOffhandRole(weaponType, role) {
    return !!role && getWeaponEquipRule(weaponType).offhandRoles.includes(role);
  }

  function canWeaponUseOffhandWeaponType(weaponType, offhandWeaponType) {
    return !!offhandWeaponType && getWeaponEquipRule(weaponType).offhandWeaponTypes.includes(offhandWeaponType);
  }

  function getWeaponProficiency(unit, weaponOrType) {
    const type = typeof weaponOrType === "string"
      ? weaponOrType
      : weaponOrType && weaponOrType.type;
    const family = getWeaponFamily(type);
    const discipline = getWeaponDiscipline(type);
    const profile = unit && unit.className ? CLASS_WEAPON_PROFICIENCY[unit.className] : null;

    if (!type || !family || !discipline || !profile) {
      return {
        tier: "neutral",
        family,
        discipline,
        label: "보통",
        description: "특별한 무기 적성 보정이 없다."
      };
    }

    if ((profile.favoredFamilies || []).includes(family)) {
      return {
        tier: "favored",
        family,
        discipline,
        label: "특기",
        description: "직업 숙련 무기라 명중과 화력이 오른다."
      };
    }

    if ((profile.toleratedFamilies || []).includes(family)) {
      return {
        tier: "tolerated",
        family,
        discipline,
        label: "보조 숙련",
        description: "다룰 수는 있지만 주특기만큼 강하지는 않다."
      };
    }

    return {
      tier: "awkward",
      family,
      discipline,
      label: "비숙련",
      description: "장착은 가능하지만 무기 적성이 맞지 않아 전투 효율이 떨어진다."
    };
  }

  function getWeaponProficiencyHiddenBonus(unit, weaponOrType) {
    const proficiency = getWeaponProficiency(unit, weaponOrType);
    const hiddenBonus = createHiddenBonusMap();
    const isMagicDiscipline = proficiency.discipline === "magic";
    const isSacredFamily = proficiency.family === "sacred";

    if (proficiency.tier === "favored") {
      hiddenBonus.accuracy += 6;

      if (isMagicDiscipline) {
        hiddenBonus.magicAttack += 2;
        hiddenBonus.skillPower += 2;
        hiddenBonus.magicDamagePercent += 0.08;
        hiddenBonus.healPower += isSacredFamily ? 2 : 1;
      } else {
        hiddenBonus.physicalAttack += 2;
        hiddenBonus.critChance += 0.03;
        hiddenBonus.physicalDamagePercent += 0.08;
      }
    } else if (proficiency.tier === "tolerated") {
      hiddenBonus.accuracy += 2;

      if (isMagicDiscipline) {
        hiddenBonus.magicAttack += 1;
        hiddenBonus.skillPower += 1;
        hiddenBonus.magicDamagePercent += 0.03;
        hiddenBonus.healPower += isSacredFamily ? 1 : 0;
      } else {
        hiddenBonus.physicalAttack += 1;
        hiddenBonus.critChance += 0.01;
        hiddenBonus.physicalDamagePercent += 0.03;
      }
    } else if (proficiency.tier === "awkward") {
      hiddenBonus.accuracy -= 8;

      if (isMagicDiscipline) {
        hiddenBonus.magicAttack -= 2;
        hiddenBonus.skillPower -= 1;
        hiddenBonus.magicDamagePercent -= 0.1;
        hiddenBonus.healPower -= isSacredFamily ? 1 : 0;
      } else {
        hiddenBonus.physicalAttack -= 2;
        hiddenBonus.critChance -= 0.03;
        hiddenBonus.physicalDamagePercent -= 0.1;
      }
    }

    return {
      proficiency,
      hiddenBonus
    };
  }

  function getEquipSlotLayout() {
    return EQUIP_SLOT_LAYOUT.slice();
  }

  function getEquipSlotMeta(slotKey) {
    return EQUIP_SLOT_META[slotKey] || null;
  }

  function getSlotLabel(slotKey) {
    const slotMeta = getEquipSlotMeta(slotKey);
    return slotMeta ? slotMeta.label : (ITEM_TYPE_META[slotKey] || slotKey || "장비");
  }

  function getTypeLabel(type) {
    return ITEM_TYPE_META[type] || getSlotLabel(type);
  }

  function getMiscItemDefinition(itemId) {
    return itemId ? clone(MISC_ITEM_DEFINITIONS[itemId] || null) : null;
  }

  function isMisc(item) {
    return !!item && (
      item.itemType === "misc"
      || item.slot === "misc"
      || item.type === "misc"
    );
  }

  function getReinforceLevel(item) {
    return Math.max(0, Math.min(REINFORCE_MAX_LEVEL, Math.floor(Number(item && item.reinforceLevel || 0))));
  }

  function getReinforceFailStreak(item) {
    return Math.max(0, Math.floor(Number(item && item.reinforceFailStreak || 0)));
  }

  function getDisplayBaseName(item) {
    if (!item) {
      return "이름 없는 아이템";
    }

    if (Array.isArray(item.affixes) && item.affixes.length && item.baseName) {
      return buildAffixedItemName(
        item.baseName,
        item.affixes.map((affix) => hydrateAffixForNaming(item, affix))
      );
    }

    return String(item.baseName || item.name || "이름 없는 아이템");
  }

  function getItemDisplayName(item, options) {
    if (!item) {
      return "이름 없는 아이템";
    }

    const nextOptions = options || {};
    const baseName = getDisplayBaseName(item);

    if (!isWeapon(item)) {
      return baseName;
    }

    const reinforceLevel = getReinforceLevel(item);
    if (!nextOptions.forceShowReinforceLevel && reinforceLevel <= 0) {
      return baseName;
    }

    return `${baseName} +${reinforceLevel}`;
  }

  function syncWeaponReinforcementStats(item) {
    if (!isWeapon(item)) {
      return item;
    }

    item.baseMight = Math.max(0, Number(item.baseMight || item.might || 0));
    item.reinforceLevel = getReinforceLevel(item);
    item.reinforceFailStreak = getReinforceFailStreak(item);
    item.might = item.baseMight + item.reinforceLevel;
    return item;
  }

  function getItemById(saveData, itemId) {
    return (saveData.inventory || []).find((item) => item.id === itemId) || null;
  }

  function getUnitById(saveData, unitId) {
    return (saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function isConsumable(item) {
    return !!item && item.slot === "consumable" && !!item.effect;
  }

  function isWeapon(item) {
    return !!item && item.slot === "weapon";
  }

  function isEquipment(item) {
    return !!item && !isConsumable(item) && !isMisc(item);
  }

  function getCompatibleSlotKeys(item) {
    if (!isEquipment(item)) {
      return [];
    }

    if (item.slot === "weapon") {
      return ["weapon", "subweapon"];
    }

    if (item.slot === "accessory") {
      return ["charm"];
    }

    return EQUIP_SLOT_LAYOUT
      .filter((entry) => entry.accepts.includes(item.slot))
      .map((entry) => entry.key);
  }

  function getItemCategory(item) {
    if (!item) {
      return "all";
    }

    if (isMisc(item)) {
      return "misc";
    }

    if (isConsumable(item)) {
      return "consumable";
    }

    if (item.slot === "weapon") {
      return "weapon";
    }

    if (item.slot === "subweapon") {
      return "subweapon";
    }

    if (["head", "shoulder", "chest", "legs", "boots"].includes(item.slot)) {
      return "armor";
    }

    if (["bracelet", "ring", "charm", "accessory"].includes(item.slot)) {
      return "accessory";
    }

    return item.slot || item.type || "equipment";
  }

  function normalizeLegacyItem(item) {
    if (!item) {
      return item;
    }

    if (isMisc(item)) {
      const miscDefinition = getMiscItemDefinition(item.id) || {};
      item.itemType = "misc";
      item.slot = "misc";
      item.type = "misc";
      item.stackable = true;
      item.quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
      item.rarity = item.rarity || miscDefinition.rarity || "common";
      item.baseName = item.baseName || miscDefinition.name || item.name || "기타 재화";
      item.name = item.baseName;
      item.description = item.description || miscDefinition.description || "기타 재화";
      item.equippedBy = null;
      item.equippedSlotKey = null;
      return item;
    }

    if (!item.slot && item.effect) {
      item.slot = "consumable";
    }

    if (item.slot === "accessory" && !item.type) {
      item.type = "accessory";
    }

    if (item.slot === "accessory" && !item.equippedSlotKey && item.equippedBy) {
      item.equippedSlotKey = "charm";
    }

    if (isConsumable(item)) {
      item.equippedBy = null;
      item.equippedSlotKey = null;
      item.baseName = item.baseName || item.name;
      item.name = item.baseName;
      return item;
    }

    item.baseName = item.baseName || item.name;

    if (item.statBonus && !item.primaryStatBonus) {
      const converted = convertLegacyBonusToModern(item.statBonus);
      item.primaryStatBonus = hasAnyBonus(converted.primaryStatBonus) ? converted.primaryStatBonus : null;
      item.statBonus = hasAnyBonus(converted.legacyStatBonus) ? converted.legacyStatBonus : null;
    }

    item.primaryStatBonus = hasAnyBonus(item.primaryStatBonus) ? item.primaryStatBonus : null;
    item.hiddenBonus = hasAnyBonus(item.hiddenBonus) ? item.hiddenBonus : null;
    item.weaponBonus = hasAnyBonus(item.weaponBonus) ? item.weaponBonus : null;
    item.affixes = Array.isArray(item.affixes) ? item.affixes : [];

    sanitizeItemRangeBonus(item);
    syncWeaponReinforcementStats(item);
    item.name = getItemDisplayName(item);

    return item;
  }

  function canEquipIntoSlot(arg1, arg2, arg3, arg4) {
    const { saveData, unit, item, slotKey } = parseEquipArgs(arg1, arg2, arg3, arg4);
    const slotMeta = getEquipSlotMeta(slotKey);

    if (!unit || !item || !slotMeta || !isEquipment(item)) {
      return false;
    }

    const isAccessoryCharm = item.slot === "accessory" && slotKey === "charm";
    const isWeaponInOffhand = slotKey === "subweapon" && item.slot === "weapon";

    if (!slotMeta.accepts.includes(item.slot) && !isAccessoryCharm && !isWeaponInOffhand) {
      return false;
    }

    if (item.slot === "weapon" && !getClassWeaponTypes(unit.className).includes(item.type)) {
      return false;
    }

    if (slotKey === "weapon") {
      return item.slot === "weapon";
    }

    if (slotKey === "subweapon") {
      if (!saveData) {
        if (item.slot === "weapon") {
          return item.type === "handaxe";
        }

        const role = getSubweaponRole(item);
        return canUseSubweaponRole(unit, role)
          && getClassWeaponTypes(unit.className).some((weaponType) => canWeaponUseOffhandRole(weaponType, role));
      }

      const candidateLoadout = buildCandidateLoadout(saveData, unit.id, item, slotKey);
      const mainWeapon = candidateLoadout.weapon;

      if (!mainWeapon || mainWeapon.id === item.id) {
        return false;
      }

      if (item.slot === "weapon") {
        return canWeaponUseOffhandWeaponType(mainWeapon.type, item.type);
      }

      const role = getSubweaponRole(item);
      return canUseSubweaponRole(unit, role) && canWeaponUseOffhandRole(mainWeapon.type, role);
    }

    return true;
  }

  function canEquip(arg1, arg2, arg3) {
    const { saveData, unit, item } = parseEquipArgs(arg1, arg2, arg3);
    return getCompatibleSlotKeys(item).some((slotKey) => canEquipIntoSlot(saveData, unit, item, slotKey));
  }

  function getEquipmentLoadout(saveData, unitId) {
    const loadout = {};
    const inventory = (saveData && saveData.inventory) || [];

    EQUIP_SLOT_LAYOUT.forEach((entry) => {
      loadout[entry.key] = null;
    });

    inventory
      .filter((item) => item.equippedBy === unitId)
      .forEach((item) => {
        const preferredSlotKey = item.equippedSlotKey;
        const compatibleSlotKeys = getCompatibleSlotKeys(item);
        const resolvedSlotKey = compatibleSlotKeys.includes(preferredSlotKey)
          ? preferredSlotKey
          : compatibleSlotKeys.find((slotKey) => !loadout[slotKey]) || compatibleSlotKeys[0];

        if (resolvedSlotKey) {
          loadout[resolvedSlotKey] = item;
        }
      });

    return loadout;
  }

  function syncEquippedItems(saveData, unitId) {
    const unit = getUnitById(saveData, unitId);

    if (!unit) {
      return;
    }

    const loadout = getEquipmentLoadout(saveData, unitId);

    unit.equippedItemIds = EQUIP_SLOT_LAYOUT
      .map((entry) => loadout[entry.key])
      .filter(Boolean)
      .map((item) => item.id);

    unit.weapon = loadout.weapon ? loadout.weapon.id : null;
  }

  function pruneUnitLoadoutConflicts(saveData, unitId) {
    const unit = getUnitById(saveData, unitId);

    if (!unit) {
      return;
    }

    const loadout = getEquipmentLoadout(saveData, unitId);
    const subweapon = loadout.subweapon;

    if (subweapon && !canEquipIntoSlot(saveData, unit, subweapon, "subweapon")) {
      subweapon.equippedBy = null;
      subweapon.equippedSlotKey = null;
    }
  }

  function normalizeInventoryState(saveData) {
    if (!saveData) {
      return saveData;
    }

    saveData.inventory = clone(saveData.inventory || []);
    saveData.roster = clone(saveData.roster || []);
    const usedSlotsByUnit = {};

    (saveData.inventory || []).forEach((item) => {
      normalizeLegacyItem(item);
    });

    (saveData.inventory || []).forEach((item) => {
      if (!item || !item.equippedBy || !isEquipment(item)) {
        item.equippedSlotKey = null;
        return;
      }

      const unit = getUnitById(saveData, item.equippedBy);

      if (!unit) {
        item.equippedBy = null;
        item.equippedSlotKey = null;
        return;
      }

      const compatibleSlotKeys = getCompatibleSlotKeys(item)
        .filter((slotKey) => canEquipIntoSlot(saveData, unit, item, slotKey));

      if (!compatibleSlotKeys.length) {
        item.equippedBy = null;
        item.equippedSlotKey = null;
        return;
      }

      const usedSlots = usedSlotsByUnit[item.equippedBy] || [];
      let resolvedSlotKey = compatibleSlotKeys.includes(item.equippedSlotKey) && !usedSlots.includes(item.equippedSlotKey)
        ? item.equippedSlotKey
        : compatibleSlotKeys.find((slotKey) => !usedSlots.includes(slotKey));

      if (!resolvedSlotKey) {
        item.equippedBy = null;
        item.equippedSlotKey = null;
        return;
      }

      usedSlots.push(resolvedSlotKey);
      usedSlotsByUnit[item.equippedBy] = usedSlots;
      item.equippedSlotKey = resolvedSlotKey;
    });

    (saveData.roster || []).forEach((unit) => {
      pruneUnitLoadoutConflicts(saveData, unit.id);
      syncEquippedItems(saveData, unit.id);
    });

    return saveData;
  }

  function getFirstAvailableSlotKey(saveData, unitId, item) {
    const unit = getUnitById(saveData, unitId);
    const loadout = getEquipmentLoadout(saveData, unitId);
    const compatibleSlotKeys = getCompatibleSlotKeys(item)
      .filter((slotKey) => canEquipIntoSlot(saveData, unit, item, slotKey));
    return compatibleSlotKeys.find((slotKey) => !loadout[slotKey]) || compatibleSlotKeys[0] || null;
  }

  function equipItemToUnit(saveData, unitId, itemId, preferredSlotKey) {
    normalizeInventoryState(saveData);
    const unit = getUnitById(saveData, unitId);
    const item = getItemById(saveData, itemId);
    const previousOwnerId = item ? item.equippedBy : null;

    if (!unit || !item) {
      throw new Error("장착 대상 유닛 또는 아이템을 찾을 수 없습니다.");
    }

    if (!isEquipment(item)) {
      throw new Error("장비만 장착할 수 있습니다.");
    }

    const targetSlotKey = preferredSlotKey || getFirstAvailableSlotKey(saveData, unitId, item);

    if (!targetSlotKey || !canEquipIntoSlot(saveData, unit, item, targetSlotKey)) {
      throw new Error(`${unit.className}은 ${getTypeLabel(item.type || item.slot)}을(를) 장착할 수 없습니다.`);
    }

    (saveData.inventory || []).forEach((entry) => {
      if (entry.id === item.id) {
        return;
      }

      if (entry.equippedBy === unitId && entry.equippedSlotKey === targetSlotKey) {
        entry.equippedBy = null;
        entry.equippedSlotKey = null;
      }
    });

    item.equippedBy = unitId;
    item.equippedSlotKey = targetSlotKey;
    pruneUnitLoadoutConflicts(saveData, unitId);
    syncEquippedItems(saveData, unitId);

    if (previousOwnerId && previousOwnerId !== unitId) {
      pruneUnitLoadoutConflicts(saveData, previousOwnerId);
      syncEquippedItems(saveData, previousOwnerId);
    }

    return item;
  }

  function unequipItem(saveData, itemId) {
    const item = getItemById(saveData, itemId);

    if (!item) {
      throw new Error("해제할 아이템을 찾을 수 없습니다.");
    }

    const previousOwnerId = item.equippedBy;
    item.equippedBy = null;
    item.equippedSlotKey = null;

    if (previousOwnerId) {
      pruneUnitLoadoutConflicts(saveData, previousOwnerId);
      syncEquippedItems(saveData, previousOwnerId);
    }

    return item;
  }

  function sortInventory(items, mode) {
    const source = (items || []).slice();

    source.sort((left, right) => {
      if (mode === "rarity") {
        const rarityGap = RARITY_ORDER.indexOf(right.rarity) - RARITY_ORDER.indexOf(left.rarity);

        if (rarityGap !== 0) {
          return rarityGap;
        }
      }

      if (mode === "type") {
        const leftType = `${getItemCategory(left)}-${getTypeLabel(left.type || left.slot)}`;
        const rightType = `${getItemCategory(right)}-${getTypeLabel(right.type || right.slot)}`;
        const typeCompare = leftType.localeCompare(rightType, "ko");

        if (typeCompare !== 0) {
          return typeCompare;
        }
      }

      if (mode === "equipped" && !!left.equippedBy !== !!right.equippedBy) {
        return left.equippedBy ? -1 : 1;
      }

      return String(left.name).localeCompare(String(right.name), "ko");
    });

    return source;
  }

  function filterInventory(items, options) {
    const nextOptions = options || {};

    return (items || []).filter((item) => {
      const typeFilter = nextOptions.type || "all";

      if (typeFilter !== "all") {
        if (typeFilter === "weapon" && item.slot !== "weapon") {
          return false;
        }

        if (typeFilter === "armor" && !["head", "shoulder", "chest", "legs", "boots"].includes(item.slot)) {
          return false;
        }

        if (typeFilter === "accessory" && !["bracelet", "ring", "charm", "accessory"].includes(item.slot)) {
          return false;
        }

        if (!["weapon", "armor", "accessory"].includes(typeFilter) && (item.slot !== typeFilter && item.type !== typeFilter)) {
          return false;
        }
      }

      if (nextOptions.rarity && nextOptions.rarity !== "all" && item.rarity !== nextOptions.rarity) {
        return false;
      }

      if (nextOptions.equipped === "equipped" && !item.equippedBy) {
        return false;
      }

      if (nextOptions.equipped === "unequipped" && item.equippedBy) {
        return false;
      }

      return true;
    });
  }

  function ensureMiscItemEntry(saveData, itemId) {
    if (!saveData) {
      return null;
    }

    const definition = getMiscItemDefinition(itemId);

    if (!definition) {
      throw new Error("정의되지 않은 기타 아이템입니다.");
    }

    saveData.inventory = saveData.inventory || [];
    let entry = getItemById(saveData, itemId);

    if (entry && !isMisc(entry)) {
      throw new Error("동일한 id를 사용하는 비정상 아이템이 인벤토리에 있습니다.");
    }

    if (!entry) {
      entry = clone(Object.assign({}, definition, {
        quantity: 0
      }));
      saveData.inventory.push(entry);
    }

    normalizeLegacyItem(entry);
    return entry;
  }

  function getMiscItemQuantity(saveData, itemId) {
    const entry = saveData ? getItemById(saveData, itemId) : null;
    return entry && isMisc(entry) ? Math.max(0, Math.floor(Number(entry.quantity || 0))) : 0;
  }

  function hasMiscItem(saveData, itemId, amount) {
    return getMiscItemQuantity(saveData, itemId) >= Math.max(0, Math.floor(Number(amount || 0)));
  }

  function grantMiscItem(saveData, itemId, amount) {
    const quantity = Math.max(0, Math.floor(Number(amount || 0)));

    if (!quantity) {
      return ensureMiscItemEntry(saveData, itemId);
    }

    const entry = ensureMiscItemEntry(saveData, itemId);
    entry.quantity = Math.max(0, Math.floor(Number(entry.quantity || 0))) + quantity;
    normalizeLegacyItem(entry);
    return entry;
  }

  function consumeMiscItem(saveData, itemId, amount) {
    const quantity = Math.max(0, Math.floor(Number(amount || 0)));
    const entry = ensureMiscItemEntry(saveData, itemId);

    if (Math.max(0, Math.floor(Number(entry.quantity || 0))) < quantity) {
      throw new Error(`${entry.name}이 부족합니다.`);
    }

    entry.quantity = Math.max(0, Math.floor(Number(entry.quantity || 0))) - quantity;
    normalizeLegacyItem(entry);
    return entry;
  }

  function createMiscItemStack(itemId, quantity) {
    const definition = getMiscItemDefinition(itemId);

    if (!definition) {
      throw new Error("정의되지 않은 기타 아이템입니다.");
    }

    const entry = clone(Object.assign({}, definition, {
      quantity: Math.max(0, Math.floor(Number(quantity || 0)))
    }));
    normalizeLegacyItem(entry);
    return entry;
  }

  function getReinforceBaseCost(level) {
    return REINFORCE_BASE_COST_TABLE.find((entry) => entry.level === Math.max(0, Math.floor(Number(level || 0)))) || null;
  }

  function getReinforceSuccessRate(item) {
    const reinforceLevel = getReinforceLevel(item);
    const failStreak = getReinforceFailStreak(item);
    let baseRate = 0.35;

    if (reinforceLevel <= 3) {
      baseRate = 1;
    } else if (reinforceLevel <= 6) {
      baseRate = 0.75;
    } else if (reinforceLevel <= 8) {
      baseRate = 0.55;
    }

    const pityBonus = failStreak >= 4
      ? 0.2
      : failStreak >= 2
        ? 0.1
        : 0;

    return {
      baseRate,
      pityBonus,
      rate: Math.min(1, baseRate + pityBonus)
    };
  }

  function getReinforceCost(item) {
    if (!isWeapon(item)) {
      return null;
    }

    const reinforceLevel = getReinforceLevel(item);
    const baseCost = getReinforceBaseCost(reinforceLevel);

    if (!baseCost) {
      return null;
    }

    const rarityMultiplier = REINFORCE_RARITY_MULTIPLIER[item.rarity] || REINFORCE_RARITY_MULTIPLIER.common;
    return {
      currentLevel: reinforceLevel,
      targetLevel: reinforceLevel + 1,
      gold: Math.max(1, Math.round(baseCost.gold * rarityMultiplier)),
      stones: Math.max(1, Math.round(baseCost.stones)),
      miscItemId: "refine-stone-basic"
    };
  }

  function getReinforcePreview(saveData, item) {
    if (!isWeapon(item)) {
      return null;
    }

    const reinforceLevel = getReinforceLevel(item);
    const currentMight = Math.max(0, Number(item.might || item.baseMight || 0));
    const targetMight = Math.max(currentMight, Math.max(0, Number(item.baseMight || item.might || 0)) + Math.min(REINFORCE_MAX_LEVEL, reinforceLevel + 1));
    const cost = getReinforceCost(item);
    const success = getReinforceSuccessRate(item);
    const goldOwned = Math.max(0, Number(saveData && saveData.partyGold || 0));
    const stoneOwned = getMiscItemQuantity(saveData, "refine-stone-basic");

    return {
      reinforceLevel,
      maxLevelReached: reinforceLevel >= REINFORCE_MAX_LEVEL || !cost,
      currentMight,
      targetMight,
      cost,
      success,
      goldOwned,
      stoneOwned,
      canAffordGold: !!cost && goldOwned >= cost.gold,
      canAffordStone: !!cost && stoneOwned >= cost.stones,
      canReinforce: !!cost && goldOwned >= cost.gold && stoneOwned >= cost.stones
    };
  }

  function reinforceWeapon(saveData, itemId) {
    const item = getItemById(saveData, itemId);

    if (!item || !isWeapon(item)) {
      throw new Error("강화할 무기를 찾을 수 없습니다.");
    }

    syncWeaponReinforcementStats(item);

    if (getReinforceLevel(item) >= REINFORCE_MAX_LEVEL) {
      throw new Error("이미 최대 강화 단계입니다.");
    }

    const preview = getReinforcePreview(saveData, item);

    if (!preview.cost) {
      throw new Error("강화 비용 정보를 찾을 수 없습니다.");
    }

    if (!preview.canAffordGold) {
      throw new Error("골드가 부족합니다.");
    }

    if (!preview.canAffordStone) {
      throw new Error("재련석이 부족합니다.");
    }

    saveData.partyGold = Math.max(0, Number(saveData.partyGold || 0)) - preview.cost.gold;
    consumeMiscItem(saveData, preview.cost.miscItemId, preview.cost.stones);

    const success = Math.random() <= preview.success.rate;

    if (success) {
      item.reinforceLevel = Math.min(REINFORCE_MAX_LEVEL, getReinforceLevel(item) + 1);
      item.reinforceFailStreak = 0;
      syncWeaponReinforcementStats(item);
      item.name = getItemDisplayName(item);
    } else {
      item.reinforceFailStreak = getReinforceFailStreak(item) + 1;
    }

    return {
      item,
      success,
      previewBefore: preview,
      previewAfter: getReinforcePreview(saveData, item)
    };
  }

  function addItemToInventory(saveData, item) {
    saveData.inventory = saveData.inventory || [];

    if (isMisc(item)) {
      const miscId = item.id;
      const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
      const entry = grantMiscItem(saveData, miscId, quantity);
      normalizeInventoryState(saveData);
      return entry;
    }

    saveData.inventory.push(clone(item));
    normalizeInventoryState(saveData);
    return item;
  }

  function removeItemFromInventory(saveData, itemId) {
    const removedItem = getItemById(saveData, itemId);
    const previousOwnerId = removedItem ? removedItem.equippedBy : null;

    if (removedItem && isMisc(removedItem)) {
      saveData.inventory = (saveData.inventory || []).filter((item) => item.id !== itemId);
      return;
    }

    saveData.inventory = (saveData.inventory || []).filter((item) => item.id !== itemId);

    if (previousOwnerId) {
      pruneUnitLoadoutConflicts(saveData, previousOwnerId);
      syncEquippedItems(saveData, previousOwnerId);
    }
  }

  function buildShopItem(productId) {
    const product = SHOP_CATALOG.find((entry) => entry.id === productId);

    if (!product) {
      throw new Error("구매할 수 없는 상품입니다.");
    }

    const item = Object.assign({}, clone(product), {
      id: `${product.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      shopId: product.id,
      basePrice: Number(product.price || 0),
      price: getBuyPrice(product),
      level: Number(product.level || product.minLevel || getRarityIndex(product.rarity) + 1),
      equippedBy: null,
      equippedSlotKey: null
    });

    normalizeLegacyItem(item);
    finalizeGeneratedEquipment(item, item.rarity, getRarityIndex(item.rarity) + 1);
    return item;
  }

  function isAvailableInShop(product) {
    return !!(product && product.availableInShop !== false);
  }

  function purchaseItem(saveData, productId) {
    const product = SHOP_CATALOG.find((entry) => entry.id === productId);
    const buyPrice = getBuyPrice(product);

    if (!product) {
      throw new Error("상품 정보를 찾을 수 없습니다.");
    }

    if (!isAvailableInShop(product)) {
      throw new Error("이 상품은 상점에서 구매할 수 없습니다.");
    }

    if ((saveData.partyGold || 0) < buyPrice) {
      throw new Error("골드가 부족합니다.");
    }

    const item = buildShopItem(productId);
    saveData.partyGold -= buyPrice;
    addItemToInventory(saveData, item);
    return item;
  }

  function isShopCatalogEntry(item) {
    return !!(item && !item.shopId && SHOP_CATALOG.some((entry) => entry.id === item.id));
  }

  function getItemBasePrice(item) {
    if (!item) {
      return 0;
    }

    if (isMisc(item)) {
      return item.id === "refine-stone-basic" ? 30 : 24;
    }

    if (Number.isFinite(Number(item.basePrice)) && Number(item.basePrice) > 0) {
      return Math.round(Number(item.basePrice));
    }

    if (Number.isFinite(Number(item.price)) && Number(item.price) > 0 && isShopCatalogEntry(item)) {
      return Math.round(Number(item.price));
    }

    const rarityIndex = getRarityIndex(item.rarity);
    const itemLevel = Math.max(1, Number(getEquipmentItemLevel(item) || item.level || 1));

    if (isConsumable(item)) {
      if (item.effect && item.effect.kind === "heal") {
        return 25 + Math.max(0, Number(item.effect.amount || 0)) * 6 + rarityIndex * 14;
      }

      if (item.effect && item.effect.kind === "reset_stats") {
        return 180;
      }

      return 40 + rarityIndex * 16;
    }

    if (isWeapon(item)) {
      return Math.round(
        70
        + rarityIndex * 42
        + itemLevel * 18
        + Math.max(0, Number(item.might || 0)) * 9
        + Math.max(0, Number(item.hit || 0)) * 0.4
        + Math.max(0, Number((item.rangeMax || 0) - (item.rangeMin || 0))) * 18
      );
    }

    const primaryBonusScore = Object.values(item.primaryStatBonus || {}).reduce(
      (sum, value) => sum + Math.abs(Number(value || 0)),
      0
    );
    const legacyBonusScore = Object.values(item.statBonus || {}).reduce(
      (sum, value) => sum + Math.abs(Number(value || 0)),
      0
    );
    const hiddenBonusScore = Object.values(item.hiddenBonus || {}).reduce(
      (sum, value) => sum + Math.abs(Number(value || 0)),
      0
    );

    return Math.round(
      60
      + rarityIndex * 38
      + itemLevel * 17
      + (primaryBonusScore + legacyBonusScore) * 12
      + hiddenBonusScore * 4
    );
  }

  function getBuyPrice(item) {
    if (!item) {
      return 0;
    }

    if (item.shopId && Number.isFinite(Number(item.price)) && Number(item.price) > 0) {
      return Math.round(Number(item.price));
    }

    if (!isShopCatalogEntry(item) && Number.isFinite(Number(item.price)) && Number(item.price) > 0) {
      return Math.round(Number(item.price));
    }

    const basePrice = getItemBasePrice(item);
    const rarityMultiplier = SHOP_PRICE_MULTIPLIER_BY_RARITY[item.rarity] || SHOP_PRICE_MULTIPLIER_BY_RARITY.common;
    return Math.max(1, Math.round(basePrice * rarityMultiplier));
  }

  function getSellPrice(item) {
    return Math.max(1, Math.floor(getBuyPrice(item) * 0.8));
  }

  function sellItem(saveData, itemId) {
    const item = getItemById(saveData, itemId);

    if (!item) {
      throw new Error("판매할 아이템을 찾을 수 없습니다.");
    }

    if (isMisc(item)) {
      throw new Error("기타 재화는 상점에 판매할 수 없습니다.");
    }

    if (item.equippedBy) {
      throw new Error("장착 중인 아이템은 먼저 해제해야 합니다.");
    }

    const sellPrice = getSellPrice(item);
    removeItemFromInventory(saveData, itemId);
    saveData.partyGold = Math.max(0, Number(saveData.partyGold || 0)) + sellPrice;
    return {
      item,
      sellPrice
    };
  }

  function applyConsumableToUnit(saveData, unit, itemId) {
    const item = getItemById(saveData, itemId);
    const persistentUnit = unit && saveData && saveData.roster
      ? (saveData.roster || []).find((entry) => entry.id === unit.id) || null
      : null;
    const targetUnit = persistentUnit || unit;

    if (!targetUnit || !item || !isConsumable(item)) {
      throw new Error("사용할 수 없는 소모품입니다.");
    }

    if (item.effect.kind === "heal") {
      if (Number(targetUnit.hp || 0) >= Number(targetUnit.maxHp || 0)) {
        throw new Error("이미 HP가 최대입니다.");
      }

      const healed = Math.min(item.effect.amount, targetUnit.maxHp - targetUnit.hp);
      targetUnit.hp += healed;

      if (persistentUnit && unit !== persistentUnit) {
        unit.hp = targetUnit.hp;
      }

      removeItemFromInventory(saveData, itemId);
      return {
        item,
        effectKind: "heal",
        healed
      };
    }

    if (item.effect.kind === "reset_stats") {
      const resetResult = StatsService.resetAllocatedPrimaryStats(saveData, targetUnit.id);

      if (persistentUnit && unit !== persistentUnit) {
        unit.primaryStats = clone(resetResult.unit.primaryStats || {});
        unit.hiddenStats = clone(resetResult.unit.hiddenStats || {});
        unit.maxHp = resetResult.unit.maxHp;
        unit.hp = Math.min(Math.max(1, Number(unit.hp || resetResult.unit.hp || resetResult.unit.maxHp)), resetResult.unit.maxHp);
        unit.str = resetResult.unit.str;
        unit.skl = resetResult.unit.skl;
        unit.spd = resetResult.unit.spd;
        unit.def = resetResult.unit.def;
        unit.mov = resetResult.unit.mov;
        unit.statPoints = resetResult.unit.statPoints || 0;
        unit.skillPoints = resetResult.unit.skillPoints || 0;
      }

      removeItemFromInventory(saveData, itemId);
      return {
        item,
        effectKind: "reset_stats",
        refundedPoints: resetResult.refundedPoints
      };
    }

    throw new Error("지원하지 않는 소모품 효과입니다.");
  }

  function chooseWeightedRarity(options) {
    const nextOptions = options || {};
    const qualityBias = Math.max(0, Math.min(0.12, Number(nextOptions.qualityBias || 0)));
    const adjustedWeights = {};
    const totalWeight = RARITY_ORDER.reduce((sum, rarity, index) => {
      const baseWeight = getRarityMeta(rarity).weight;
      const rarityFactor = index === 0
        ? Math.max(0.55, 1 - qualityBias * 1.35)
        : (1 + qualityBias * index * 0.45);
      const adjustedWeight = baseWeight * rarityFactor;
      adjustedWeights[rarity] = adjustedWeight;
      return sum + adjustedWeight;
    }, 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < RARITY_ORDER.length; index += 1) {
      const rarity = RARITY_ORDER[index];
      roll -= adjustedWeights[rarity];

      if (roll <= 0) {
        return rarity;
      }
    }

    return "common";
  }

  function maybeChooseSetTemplate(enemyLevel, options) {
    const nextOptions = options || {};
    const level = Math.max(1, Number(enemyLevel || 1));
    const qualityBias = Math.max(0, Math.min(0.12, Number(nextOptions.qualityBias || 0)));
    const setChance = level < 10
      ? 0
      : Math.min(0.16, 0.02 + (level * 0.0025) + (qualityBias * 0.35));

    if (Math.random() > setChance) {
      return null;
    }

    const eligible = SET_ITEM_TEMPLATES.filter((template) => level >= Number(template.minLevel || 1));

    if (!eligible.length) {
      return null;
    }

    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  function scaleBonusMap(baseBonus, rarityIndex, enemyLevel) {
    const powerBonus = rarityIndex + Math.max(0, (enemyLevel || 1) - 1);
    const scaled = {};

    Object.keys(baseBonus || {}).forEach((statName) => {
      const baseValue = baseBonus[statName];
      const growth = statName === "maxHp" ? Math.floor(powerBonus / 3) : Math.floor(powerBonus / 4);
      scaled[statName] = baseValue + Math.max(0, growth);
    });

    return scaled;
  }

  function buildLootStats(template, rarity, enemyLevel) {
    const rarityIndex = Math.max(0, RARITY_ORDER.indexOf(rarity));
    const powerBonus = rarityIndex + Math.max(0, (enemyLevel || 1) - 1);
    return {
      might: template.base.might + Math.floor(powerBonus / 2),
      hit: template.base.hit + Math.min(10, rarityIndex * 2),
      rangeMin: template.base.rangeMin,
      rangeMax: template.base.rangeMax,
      uses: template.base.uses + rarityIndex * 3
    };
  }

  function createLootDrop(enemyLevel, options) {
    const setTemplate = maybeChooseSetTemplate(enemyLevel, options);

    if (setTemplate) {
      const setItem = clone(setTemplate);
      setItem.id = `${setTemplate.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      setItem.baseName = setTemplate.name;
      setItem.name = setTemplate.name;
      setItem.level = Number(enemyLevel || setTemplate.minLevel || 1);
      setItem.equippedBy = null;
      setItem.equippedSlotKey = null;
      setItem.setName = (getSetDefinition(setTemplate.setId) && getSetDefinition(setTemplate.setId).name) || "";
      normalizeLegacyItem(setItem);
      finalizeGeneratedEquipment(setItem, setItem.rarity, enemyLevel || 1);
      return setItem;
    }

    const rarity = chooseWeightedRarity(options);
    const template = LOOT_TEMPLATES[Math.floor(Math.random() * LOOT_TEMPLATES.length)];

    if (template.slot === "weapon") {
      const stats = buildLootStats(template, rarity, enemyLevel || 1);
      const item = {
        id: `loot-${template.key}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        name: template.names[rarity],
        baseName: template.names[rarity],
        slot: template.slot,
        type: template.type,
        rarity,
        level: Number(enemyLevel || 1),
        equippedBy: null,
        equippedSlotKey: null,
        might: stats.might,
        hit: stats.hit,
        rangeMin: stats.rangeMin,
        rangeMax: stats.rangeMax,
        uses: stats.uses
      };

      finalizeGeneratedEquipment(item, rarity, enemyLevel || 1);
      return item;
    }

    const item = {
      id: `loot-${template.key}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: template.names[rarity],
      baseName: template.names[rarity],
      slot: template.slot,
      type: template.type,
      rarity,
      level: Number(enemyLevel || 1),
      equippedBy: null,
      equippedSlotKey: null
    };

    normalizeLegacyItem(Object.assign(item, {
      statBonus: scaleBonusMap(template.baseBonus || {}, Math.max(0, RARITY_ORDER.indexOf(rarity)), enemyLevel || 1),
      primaryStatBonus: scalePrimaryBonusMap(template.basePrimaryBonus || {}, Math.max(0, RARITY_ORDER.indexOf(rarity)), enemyLevel || 1),
      hiddenBonus: scaleHiddenBonusMap(template.baseHiddenBonus || {}, Math.max(0, RARITY_ORDER.indexOf(rarity)), enemyLevel || 1)
    }));
    finalizeGeneratedEquipment(item, rarity, enemyLevel || 1);
    return item;
  }

  function createRewardItem(rewardDefinition) {
    if (!rewardDefinition) {
      throw new Error("보상 아이템 정보가 없습니다.");
    }

    const item = Object.assign({}, clone(rewardDefinition), {
      id: `${rewardDefinition.idPrefix || rewardDefinition.type || rewardDefinition.slot}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      level: Number(rewardDefinition.level || rewardDefinition.minLevel || 1),
      equippedBy: null,
      equippedSlotKey: null
    });

    normalizeLegacyItem(item);
    return item;
  }

  function getEquippedItems(saveData, unitId) {
    const loadout = getEquipmentLoadout(saveData, unitId);
    return EQUIP_SLOT_LAYOUT
      .map((entry) => loadout[entry.key])
      .filter(Boolean);
  }

  function getEquippedBonusSummary(saveData, unitOrId) {
    const unitId = typeof unitOrId === "string" ? unitOrId : unitOrId && unitOrId.id;
    const bonuses = {
      primary: createPrimaryBonusMap(),
      legacy: createLegacyBonusMap(),
      hidden: createHiddenBonusMap(),
      sets: []
    };

    if (!unitId) {
      return bonuses;
    }

    const setCounts = {};

    getEquippedItems(saveData, unitId).forEach((item) => {
      addBonusMaps(bonuses.primary, item.primaryStatBonus || {}, clampPrimaryBonus);
      addBonusMaps(bonuses.legacy, item.statBonus || {}, null);
      addBonusMaps(bonuses.hidden, item.hiddenBonus || {}, roundHiddenBonus);
      addBonusMaps(bonuses.hidden, getOffhandWeaponSupportBonus(item), roundHiddenBonus);

      if (item.setId) {
        setCounts[item.setId] = Number(setCounts[item.setId] || 0) + 1;
      }
    });

    Object.keys(setCounts).forEach((setId) => {
      const pieceCount = setCounts[setId];
      const activeBonuses = getSetBonusEntries(setId, pieceCount);

      activeBonuses.forEach((bonus) => {
        addBonusMaps(bonuses.primary, bonus.primaryStatBonus || {}, clampPrimaryBonus);
        addBonusMaps(bonuses.legacy, bonus.legacyStatBonus || {}, null);
        addBonusMaps(bonuses.hidden, bonus.hiddenBonus || {}, roundHiddenBonus);
      });

      bonuses.sets.push({
        setId,
        setName: (getSetDefinition(setId) && getSetDefinition(setId).name) || setId,
        pieces: pieceCount,
        activeBonuses
      });
    });

    return bonuses;
  }

  function getEquippedStatBonus(saveData, unitOrId) {
    return getEquippedBonusSummary(saveData, unitOrId).legacy;
  }

  function applyEquipmentBonusesToUnitState(saveData, unit) {
    if (!saveData || !unit) {
      return unit;
    }

    const statsService = getStatsService();
    const bonus = getEquippedBonusSummary(saveData, unit.id);

    if (statsService && unit.primaryStats) {
      statsService.normalizeUnitProgression(unit);
      PRIMARY_STATS.forEach((statName) => {
        const statLimit = statsService.STAT_LIMITS && statsService.STAT_LIMITS[statName]
          ? statsService.STAT_LIMITS[statName]
          : 99999;
        unit.primaryStats[statName] = Math.min(statLimit, (unit.primaryStats[statName] || 0) + Number(bonus.primary[statName] || 0));
      });
      statsService.recalculateUnitStats(unit, { keepHpFull: !unit.hp || unit.hp >= unit.maxHp });
    }

    unit.maxHp += bonus.legacy.maxHp || 0;
    unit.str += bonus.legacy.str || 0;
    unit.skl += bonus.legacy.skl || 0;
    unit.spd += bonus.legacy.spd || 0;
    unit.def += bonus.legacy.def || 0;
    unit.mov += bonus.legacy.mov || 0;

    if (unit.hiddenStats) {
      Object.keys(bonus.hidden).forEach((statName) => {
        unit.hiddenStats[statName] = roundHiddenBonus(
          statName,
          Number(unit.hiddenStats[statName] || 0) + Number(bonus.hidden[statName] || 0)
        );
      });
    }

    unit.equipmentBonus = bonus;
    return unit;
  }

  function getEffectiveUnitStats(saveData, unit) {
    if (!unit) {
      return null;
    }

    const nextUnit = clone(unit);
    applyEquipmentBonusesToUnitState(saveData, nextUnit);
    return nextUnit;
  }

  function formatStatBonusLine(statBonus) {
    const item = statBonus && (statBonus.primaryStatBonus || statBonus.hiddenBonus || statBonus.weaponBonus || statBonus.affixes || statBonus.slot)
      ? statBonus
      : null;
    const primaryStatBonus = item ? item.primaryStatBonus : null;
    const legacyStatBonus = item ? item.statBonus : statBonus;
    const hiddenBonus = item ? item.hiddenBonus : null;
    const parts = [];

    Object.keys(PRIMARY_STAT_LABELS)
      .filter((statName) => primaryStatBonus && primaryStatBonus[statName])
      .forEach((statName) => {
        parts.push(`${PRIMARY_STAT_LABELS[statName]} +${primaryStatBonus[statName]}`);
      });

    Object.keys(STAT_LABELS)
      .filter((statName) => legacyStatBonus && legacyStatBonus[statName])
      .forEach((statName) => {
        parts.push(`${STAT_LABELS[statName]} +${legacyStatBonus[statName]}`);
      });

    Object.keys(HIDDEN_BONUS_LABELS)
      .filter((statName) => hiddenBonus && hiddenBonus[statName])
      .forEach((statName) => {
        const value = hiddenBonus[statName];
        parts.push(isPercentHiddenBonus(statName)
          ? `${HIDDEN_BONUS_LABELS[statName]} +${Math.round(value * 100)}%`
          : `${HIDDEN_BONUS_LABELS[statName]} +${value}`);
      });

    return parts.join(" / ") || "추가 능력치 없음";
  }

  function getEquipmentItemLevel(item) {
    if (!isEquipment(item)) {
      return null;
    }

    if (Number.isFinite(Number(item.level))) {
      return Math.max(1, Math.floor(Number(item.level)));
    }

    if (Number.isFinite(Number(item.minLevel))) {
      return Math.max(1, Math.floor(Number(item.minLevel)));
    }

    return null;
  }

  function describeItem(item) {
    if (!item) {
      return "없음";
    }

    if (isMisc(item)) {
      return `${item.name} / 보유 수량 ${Math.max(0, Math.floor(Number(item.quantity || 0)))}개 / ${item.description || "기타 재화"}`;
    }

    const rarityLabel = getRarityMeta(item.rarity).label;

    const setLabel = item.setId ? ` / ${buildSetSummaryLine(item.setId, 1)}` : "";

    if (isWeapon(item)) {
      return `${item.name} [${rarityLabel}] 위력 ${item.might} / 명중 ${item.hit} / 사거리 ${item.rangeMin}-${item.rangeMax} / 내구 ${item.uses}${formatStatBonusLine(item) !== "추가 능력치 없음" ? ` / ${formatStatBonusLine(item)}` : ""}${setLabel}`;
    }

    if (isConsumable(item)) {
      return `${item.name} [${rarityLabel}] ${item.description || "소모품"}`;
    }

    return `${item.name} [${rarityLabel}] ${getSlotLabel(item.equippedSlotKey || getCompatibleSlotKeys(item)[0] || item.slot)} / ${formatStatBonusLine(item)}${setLabel}`;
  }

  global.InventoryService = {
    RARITY_ORDER,
    RARITY_META,
    EQUIP_SLOT_LAYOUT,
    EQUIP_SLOT_META,
    ITEM_TYPE_META,
    MISC_ITEM_DEFINITIONS,
    REINFORCE_MAX_LEVEL,
    REINFORCE_BASE_COST_TABLE,
    REINFORCE_RARITY_MULTIPLIER,
    STAT_LABELS,
    CLASS_WEAPONS,
    SHOP_CATALOG,
    getRarityMeta,
    getClassWeaponTypes,
    getWeaponFamily,
    getWeaponDiscipline,
    getWeaponProficiency,
    getWeaponProficiencyHiddenBonus,
    getEquipSlotLayout,
    getEquipSlotMeta,
    getSlotLabel,
    getTypeLabel,
    getMiscItemDefinition,
    getItemById,
    getUnitById,
    getItemCategory,
    getCompatibleSlotKeys,
    getEquipmentLoadout,
    getEquippedItems,
    getEquippedBonusSummary,
    getEquippedStatBonus,
    getEffectiveUnitStats,
    canEquipIntoSlot,
    canEquip,
    isConsumable,
    isWeapon,
    isMisc,
    isEquipment,
    equipItemToUnit,
    unequipItem,
    ensureMiscItemEntry,
    getMiscItemQuantity,
    hasMiscItem,
    grantMiscItem,
    consumeMiscItem,
    createMiscItemStack,
    addItemToInventory,
    removeItemFromInventory,
    buildShopItem,
    isAvailableInShop,
    purchaseItem,
    getBuyPrice,
    getSellPrice,
    sellItem,
    applyConsumableToUnit,
    sortInventory,
    filterInventory,
    createLootDrop,
    createRewardItem,
    describeItem,
    getItemDisplayName,
    formatStatBonusLine,
    getEquipmentItemLevel,
    getReinforceLevel,
    getReinforceFailStreak,
    getReinforceCost,
    getReinforceSuccessRate,
    getReinforcePreview,
    reinforceWeapon,
    getSetDefinition,
    getSetBonusEntries,
    syncEquippedItems,
    normalizeInventoryState,
    applyEquipmentBonusesToUnitState,
    finalizeGeneratedEquipment
  };
})(window);
