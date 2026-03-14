/* 역할: 전투 상태, 턴 진행, 이동/공격 판정, 승패, 저장 동기화, 장비/스탯 반영을 담당한다. */

(function attachBattleService(global) {
  const StorageService = global.StorageService;
  const CombatService = global.CombatService;
  const AIService = global.AIService;
  const InventoryService = global.InventoryService;
  const StatsService = global.StatsService;
  const SkillsService = global.SkillsService;
  const ENDLESS_STAGE_ID = "endless-rift";
  const RIFT_DEFENSE_STAGE_ID = "rift-defense";
  const MAP_WIDTH = 14;
  const MAP_HEIGHT = 8;
  const ACTION_DURABILITY_CONSUME_CHANCE = Number(InventoryService && InventoryService.ACTION_DURABILITY_CONSUME_CHANCE || 0.5);

  const ALLY_SPAWNS = [
    { x: 1, y: 6 },
    { x: 2, y: 6 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 1, y: 4 }
  ];

  const ENEMY_SPAWN_CANDIDATES = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 12, y: 3 }
  ];
  const ENDLESS_ENEMY_SPAWN_CANDIDATES = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 10, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 10, y: 2 },
    { x: 12, y: 3 },
    { x: 11, y: 3 }
  ];
  const RIFT_DEFENSE_ENEMY_SPAWNS = [
    { x: 12, y: 1 },
    { x: 11, y: 1 },
    { x: 12, y: 2 },
    { x: 13, y: 2 },
    { x: 11, y: 2 },
    { x: 12, y: 3 }
  ];
  const RIFT_DEFENSE_OBJECTIVE = {
    x: 3,
    y: 3,
    hp: 40,
    label: "거점"
  };
  const RIFT_DEFENSE_MAP_TILES = [
    ["plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "forest", "plain", "plain"],
    ["plain", "forest", "plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "hill", "plain", "plain", "forest", "plain", "plain", "hill", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"],
    ["plain", "forest", "plain", "plain", "plain", "hill", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
  ];

  const TILE_ELEVATION_BY_TYPE = {
    plain: 0,
    forest: 1,
    hill: 2,
    marsh: 0,
    ruin: 1,
    wall: 3
  };

  const MAP_TEMPLATE = [
    ["plain", "plain", "hill", "forest", "plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "forest", "plain", "forest", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain"],
    ["plain", "plain", "hill", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "hill", "plain"],
    ["plain", "wall", "wall", "plain", "plain", "plain", "plain", "plain", "plain", "forest", "plain", "plain"],
    ["plain", "plain", "forest", "plain", "forest", "plain", "wall", "wall", "hill", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "hill", "wall", "plain", "forest", "plain", "forest", "plain", "plain", "plain"],
    ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
  ];

  const ENEMY_ARCHETYPES = [
    {
      id: "raider_swordsman",
      className: "검사",
      weaponType: "sword",
      namePool: ["루크", "바젤", "이안"],
      weaponProfile: { name: "적 철검" }
    },
    {
      id: "raider_brute",
      className: "브리건드",
      weaponType: "axe",
      namePool: ["그론", "마르크", "헤일"],
      weaponProfile: { name: "적 철도끼" }
    },
    {
      id: "raider_hunter",
      className: "헌터",
      weaponType: "bow",
      namePool: ["스카", "린트", "가온"],
      weaponProfile: { name: "적 사냥활" }
    },
    {
      id: "raider_soldier",
      className: "솔저",
      weaponType: "lance",
      namePool: ["칼론", "브란", "카제"],
      weaponProfile: { name: "적 철창" }
    },
    {
      id: "goblin_skirmisher",
      className: "고블린 척후병",
      weaponType: "sword",
      namePool: ["재깍", "칼귀", "핏송곳"],
      mov: 6,
      statBonuses: { skl: 1, spd: 2, def: -1 },
      weaponProfile: { name: "녹슨 단검", might: 4, hit: 90, uses: 42 }
    },
    {
      id: "slime_mass",
      className: "점액괴물",
      weaponType: "sword",
      namePool: ["청록 점액", "흉포 점액", "늪 점액"],
      mov: 4,
      statBonuses: { maxHp: 4, str: 1, spd: -2, def: 1 },
      weaponProfile: { name: "점액 촉수", might: 5, hit: 80, uses: 50 }
    },
    {
      id: "dire_wolf",
      className: "흉포 늑대",
      weaponType: "sword",
      namePool: ["회색 송곳니", "붉은 송곳니", "검은 갈기"],
      mov: 7,
      statBonuses: { str: 1, spd: 2, def: -1 },
      weaponProfile: { name: "찢는 송곳니", might: 6, hit: 88, uses: 40 }
    },
    {
      id: "ghoul",
      className: "구울",
      weaponType: "axe",
      namePool: ["썩은 망령", "무덤 포식자", "검은 구울"],
      mov: 5,
      statBonuses: { maxHp: 2, str: 2, skl: -1, spd: -1 },
      weaponProfile: { name: "시체 갈퀴", might: 8, hit: 70, uses: 34 }
    },
    {
      id: "harpy",
      className: "하피",
      weaponType: "bow",
      namePool: ["비명 날개", "회오리 깃", "갈퀴 하피"],
      mov: 6,
      statBonuses: { skl: 2, spd: 2, def: -1 },
      weaponProfile: { name: "깃칼 탄막", might: 5, hit: 90, uses: 32 }
    },
    {
      id: "orc_reaver",
      className: "오크 파쇄병",
      weaponType: "axe",
      namePool: ["부러진 엄니", "검은 어깨", "붉은 주먹"],
      mov: 4,
      statBonuses: { maxHp: 3, str: 3, skl: -1, spd: -1, def: 1 },
      weaponProfile: { name: "전투 절단도끼", might: 9, hit: 72, uses: 32 }
    },
    {
      id: "skeleton_pikeman",
      className: "스켈레톤 창병",
      weaponType: "lance",
      namePool: ["백골 수비병", "부서진 척추", "공허 창수"],
      mov: 5,
      statBonuses: { skl: 1, def: 1 },
      weaponProfile: { name: "녹슨 뼈창", might: 6, hit: 82, uses: 38 }
    },
    {
      id: "gargoyle",
      className: "가고일",
      weaponType: "lance",
      namePool: ["석익", "암회 날개", "파수 괴조"],
      mov: 5,
      statBonuses: { maxHp: 2, skl: 1, spd: 1, def: 2 },
      weaponProfile: { name: "석창 날개", might: 7, hit: 78, uses: 36 }
    },
    {
      id: "basilisk",
      className: "바실리스크",
      weaponType: "bow",
      namePool: ["황혼 독안", "석화 눈동자", "늪의 응시"],
      mov: 4,
      statBonuses: { maxHp: 1, str: 1, skl: 3, spd: -1 },
      weaponProfile: { name: "석화 침", might: 6, hit: 92, uses: 30 },
      specialActiveSkillIds: ["marked_shot"]
    }
  ];

  const ENEMY_ARCHETYPE_POOLS = {
    default: ["raider_swordsman", "raider_brute", "raider_hunter", "raider_soldier"],
    "prologue-field": ["goblin_skirmisher", "slime_mass", "dire_wolf"],
    "timber-ridge": ["goblin_skirmisher", "ghoul", "harpy"],
    "red-fort": ["orc_reaver", "skeleton_pikeman", "gargoyle", "basilisk"],
    "endless-rift": [
      "raider_swordsman",
      "raider_brute",
      "raider_hunter",
      "raider_soldier",
      "goblin_skirmisher",
      "slime_mass",
      "dire_wolf",
      "ghoul",
      "harpy",
      "orc_reaver",
      "skeleton_pikeman",
      "gargoyle",
      "basilisk"
    ]
  };
  const NON_REPEATABLE_STAGE_IDS = new Set(["prologue-field"]);

  const ENEMY_VARIANT_PREFIXES = {
    maxHp: "거대한",
    str: "사나운",
    skl: "교활한",
    spd: "날랜",
    def: "단단한"
  };

  const ENEMY_VARIANT_STATS = ["maxHp", "str", "skl", "spd", "def"];
  const ENDLESS_PARTY_HIDDEN_STAT_KEYS = [
    "physicalAttack",
    "magicAttack",
    "skillPower",
    "healPower",
    "accuracy",
    "evasion",
    "physicalDefense",
    "magicDefense",
    "critChance"
  ];
  const ENDLESS_ENEMY_PRIMARY_WEIGHTS = {
    sword: { str: 0.64, dex: 0.58, vit: 0.52, int: 0.18, luk: 0.34 },
    axe: { str: 0.76, dex: 0.34, vit: 0.62, int: 0.12, luk: 0.22 },
    bow: { str: 0.46, dex: 0.82, vit: 0.38, int: 0.18, luk: 0.48 },
    lance: { str: 0.58, dex: 0.48, vit: 0.72, int: 0.14, luk: 0.28 },
    staff: { str: 0.18, dex: 0.42, vit: 0.34, int: 0.82, luk: 0.32 },
    wand: { str: 0.16, dex: 0.46, vit: 0.32, int: 0.88, luk: 0.34 },
    tome: { str: 0.14, dex: 0.44, vit: 0.34, int: 0.94, luk: 0.36 },
    grimoire: { str: 0.16, dex: 0.42, vit: 0.36, int: 0.98, luk: 0.34 },
    focus: { str: 0.18, dex: 0.38, vit: 0.42, int: 0.92, luk: 0.34 }
  };
  const ENDLESS_ENEMY_EQUIPMENT_TEMPLATES = {
    sword: {
      items: ["사냥 투구", "척후 흉갑", "경장 장화", "철 버클러"],
      primaryBonuses: { str: 1, dex: 1, vit: 1, luk: 1 },
      hiddenBonuses: { physicalAttack: 3, accuracy: 5, evasion: 3, physicalDefense: 4, critChance: 1 },
      weaponBonuses: { might: 1, hit: 2 }
    },
    axe: {
      items: ["뿔 투구", "돌격 갑주", "강철 장화", "전투 토템"],
      primaryBonuses: { str: 2, vit: 2 },
      hiddenBonuses: { physicalAttack: 5, physicalDefense: 4, accuracy: 2, critChance: 2 },
      weaponBonuses: { might: 2, hit: 1 }
    },
    bow: {
      items: ["사냥 후드", "레인저 조끼", "질주 장화", "강화 화살통"],
      primaryBonuses: { str: 1, dex: 2, vit: 1, luk: 1 },
      hiddenBonuses: { physicalAttack: 2, accuracy: 9, evasion: 4, critChance: 3 },
      weaponBonuses: { might: 1, hit: 4 }
    },
    lance: {
      items: ["가드 헬름", "수비 갑옷", "철각 경갑", "카이트 실드"],
      primaryBonuses: { str: 1, dex: 1, vit: 2 },
      hiddenBonuses: { physicalAttack: 2, accuracy: 4, physicalDefense: 6, magicDefense: 2 },
      weaponBonuses: { might: 1, hit: 2 }
    },
    staff: {
      items: ["성직 모자", "예식 장포", "정화 신발", "은빛 성유물"],
      primaryBonuses: { vit: 1, int: 2, luk: 1 },
      hiddenBonuses: { magicAttack: 2, healPower: 5, magicDefense: 5, accuracy: 4 },
      weaponBonuses: { might: 1, hit: 3 }
    },
    wand: {
      items: ["마도 후드", "비전 예복", "공명 장화", "암영 구체"],
      primaryBonuses: { dex: 1, int: 2, luk: 1 },
      hiddenBonuses: { magicAttack: 5, skillPower: 4, accuracy: 4, evasion: 2 },
      weaponBonuses: { might: 2, hit: 2 }
    },
    tome: {
      items: ["마도 후드", "비전 예복", "공명 장화", "암영 구체"],
      primaryBonuses: { dex: 1, int: 2, luk: 1 },
      hiddenBonuses: { magicAttack: 5, skillPower: 4, accuracy: 4, evasion: 2 },
      weaponBonuses: { might: 2, hit: 2 }
    },
    grimoire: {
      items: ["마도 후드", "비전 예복", "공명 장화", "암영 구체"],
      primaryBonuses: { dex: 1, int: 2, luk: 1 },
      hiddenBonuses: { magicAttack: 5, skillPower: 4, accuracy: 4, evasion: 2 },
      weaponBonuses: { might: 2, hit: 2 }
    },
    focus: {
      items: ["성직 모자", "예식 장포", "정화 신발", "은빛 성유물"],
      primaryBonuses: { vit: 1, int: 2, luk: 1 },
      hiddenBonuses: { magicAttack: 2, healPower: 5, magicDefense: 5, accuracy: 4 },
      weaponBonuses: { might: 1, hit: 3 }
    }
  };

  const ENDLESS_STAGE_META = {
    id: ENDLESS_STAGE_ID,
    name: "무한 균열"
  };
  const RIFT_DEFENSE_STAGE_META = {
    id: RIFT_DEFENSE_STAGE_ID,
    name: "균열 봉쇄전"
  };
  const RIFT_DEFENSE_WAVES = [
    {
      banner: "제1웨이브 시작 - 전선 형성",
      enemyArchetypeIds: ["slime_mass", "goblin_skirmisher", "raider_soldier"],
      spawnIndices: [0, 1, 2],
      reward: { gold: 40, refineStone: 1, exp: 16 }
    },
    {
      banner: "제2웨이브 시작 - 원거리 견제",
      enemyArchetypeIds: ["raider_hunter", "ghoul", "raider_swordsman"],
      spawnIndices: [0, 2, 4],
      reward: { gold: 48, refineStone: 1, exp: 18 }
    },
    {
      banner: "제3웨이브 시작 - 기동 압박",
      enemyArchetypeIds: ["dire_wolf", "harpy", "goblin_skirmisher"],
      spawnIndices: [1, 2, 3],
      reward: { gold: 56, refineStone: 1, exp: 22 }
    },
    {
      banner: "제4웨이브 시작 - 정예 반응 감지",
      enemyArchetypeIds: ["orc_reaver", "gargoyle", "skeleton_pikeman"],
      spawnIndices: [0, 2, 4],
      reward: { gold: 68, refineStone: 1, exp: 26 },
      variantBudget: 1
    },
    {
      banner: "최종 웨이브 - 균열 핵심체 출현",
      enemyArchetypeIds: ["harpy", "basilisk", "orc_reaver"],
      spawnIndices: [1, 3, 4],
      reward: { gold: 82, refineStone: 1, exp: 30 },
      variantBudget: 1,
      boss: {
        id: "rift-defense-boss",
        name: "모르가스",
        title: "균열 돌격대장",
        className: "솔저",
        weaponType: "lance",
        spawn: { x: 12, y: 2 },
        levelBonus: 3,
        maxHpBonus: 8,
        statBonuses: { str: 3, skl: 2, spd: 1, def: 2 },
        movBonus: 1,
        specialSkillIds: ["fortress_heart"],
        specialActiveSkillIds: ["guard_roar"]
      }
    }
  ];
  const RIFT_DEFENSE_GRADE_ORDER = ["S", "A", "B", "C"];

  const ENDLESS_RELICS = {
    vanguard_emblem: {
      id: "vanguard_emblem",
      name: "선봉 휘장",
      description: "출전 파티의 STR +1",
      apply(unit) {
        unit.str += 1;
      }
    },
    feather_boots: {
      id: "feather_boots",
      name: "깃털 군화",
      description: "출전 파티의 MOV +1",
      apply(unit) {
        unit.mov += 1;
      }
    },
    hawk_scope: {
      id: "hawk_scope",
      name: "매눈 조준기",
      description: "출전 파티의 SKL +2",
      apply(unit) {
        unit.skl += 2;
      }
    },
    ward_shell: {
      id: "ward_shell",
      name: "수호 갑각",
      description: "출전 파티의 DEF +2",
      apply(unit) {
        unit.def += 2;
      }
    },
    life_signet: {
      id: "life_signet",
      name: "생명의 인장",
      description: "출전 파티의 최대 HP +3",
      apply(unit) {
        unit.maxHp += 3;
        unit.hp += 3;
      }
    }
  };

  const ENDLESS_SPECIAL_RULES = [
    {
      id: "enemy_onslaught",
      name: "균열 맹공",
      description: "적 전원의 공격력이 상승한다.",
      targetTeam: "enemy",
      effect: {
        id: "rift-onslaught",
        name: "균열 맹공",
        attackPowerBonus: 2
      }
    },
    {
      id: "enemy_fortify",
      name: "강철 장막",
      description: "적 전원의 방어력이 상승한다.",
      targetTeam: "enemy",
      effect: {
        id: "rift-fortify",
        name: "강철 장막",
        defenseBonus: 2
      }
    },
    {
      id: "ally_focus",
      name: "집중의 기류",
      description: "아군 전원의 명중이 상승한다.",
      targetTeam: "ally",
      effect: {
        id: "rift-focus",
        name: "집중의 기류",
        hitBonus: 8
      }
    },
    {
      id: "swift_stride",
      name: "가속 파동",
      description: "모든 유닛의 속도가 상승한다.",
      targetTeam: "all",
      effect: {
        id: "rift-swift",
        name: "가속 파동",
        avoidBonus: 6
      }
    }
  ];

  const ENDLESS_ELITE_PROFILES = {
    sword: {
      title: "균열 검호",
      passiveSkillIds: ["warlord_presence"],
      activeSkillIds: ["boss_cleave"]
    },
    axe: {
      title: "균열 파쇄자",
      passiveSkillIds: ["warlord_presence"],
      activeSkillIds: ["boss_cleave"]
    },
    bow: {
      title: "균열 명사수",
      passiveSkillIds: ["eagle_commander"],
      activeSkillIds: ["rain_of_arrows"]
    },
    lance: {
      title: "균열 수호병",
      passiveSkillIds: ["fortress_heart"],
      activeSkillIds: ["guard_roar"]
    }
  };

  const ENDLESS_ELITE_TRAITS = [
    {
      id: "berserker",
      name: "광전",
      description: "공격력이 크게 상승한다.",
      statBonuses: { str: 2, spd: 1 },
      activeSkillIds: ["frenzy_assault"],
      effect: {
        id: "elite-berserker",
        name: "광전",
        attackPowerBonus: 2
      }
    },
    {
      id: "bulwark",
      name: "장갑",
      description: "방어와 체력이 강화된다.",
      statBonuses: { def: 2, maxHp: 4 },
      activeSkillIds: ["adamant_guard"],
      effect: {
        id: "elite-bulwark",
        name: "장갑",
        defenseBonus: 2
      }
    },
    {
      id: "deadeye",
      name: "정조준",
      description: "명중과 회피가 강화된다.",
      statBonuses: { skl: 2, spd: 1 },
      activeSkillIds: ["marked_shot"],
      effect: {
        id: "elite-deadeye",
        name: "정조준",
        hitBonus: 10,
        avoidBonus: 6
      }
    }
  ];

  const ENDLESS_EVENT_CHAINS = {
    merchant_caravan: {
      id: "merchant_caravan",
      name: "흐릿한 상단",
      starter: {
        id: "chain_merchant_start",
        title: "흐릿한 상단 흔적",
        description: "사라진 상단의 흔적을 쫓는다. 다음 이벤트층에서 결말이 열린다."
      },
      followUp: {
        id: "chain_merchant_resolve",
        title: "잃어버린 상단",
        description: "흩어진 상단을 찾아 보급품과 전리품을 회수한다."
      }
    },
    altar_echo: {
      id: "altar_echo",
      name: "울리는 제단",
      starter: {
        id: "chain_altar_start",
        title: "울리는 제단의 속삭임",
        description: "균열 제단의 속삭임을 받아들인다. 다음 이벤트층에서 응답이 온다."
      },
      followUp: {
        id: "chain_altar_resolve",
        title: "깨어난 제단",
        description: "제단이 열리며 유물의 힘이나 대체 축복을 내린다."
      }
    },
    fallen_banner: {
      id: "fallen_banner",
      name: "쓰러진 기수단",
      starter: {
        id: "chain_banner_start",
        title: "쓰러진 기수단의 깃발",
        description: "오래된 군기를 거둔다. 다음 이벤트층에서 맹세의 보답을 받는다."
      },
      followUp: {
        id: "chain_banner_resolve",
        title: "기수단의 맹세",
        description: "남겨진 의지가 파티를 단련시키고 무기를 정비한다."
      }
    },
    sealed_workshop: {
      id: "sealed_workshop",
      name: "봉인된 공방",
      starter: {
        id: "chain_workshop_start",
        title: "봉인된 공방의 문장",
        description: "잠긴 공방의 문양을 해독한다. 다음 이벤트층에서 문이 열린다."
      },
      followUp: {
        id: "chain_workshop_resolve",
        title: "열린 공방",
        description: "오래된 공방이 열리며 장비 보정과 보급품을 남긴다."
      }
    },
    lost_patrol: {
      id: "lost_patrol",
      name: "실종 순찰대",
      starter: {
        id: "chain_patrol_start",
        title: "실종 순찰대의 구조 신호",
        description: "희미한 구조 신호를 따라간다. 다음 이벤트층에서 생존자를 찾을 수 있다."
      },
      followUp: {
        id: "chain_patrol_resolve",
        title: "구조된 순찰대",
        description: "남겨진 병참과 전술 기록이 파티를 돕는다."
      }
    }
  };

  const STAGE_DEFINITIONS = [
    {
      id: "prologue-field",
      name: "프롤로그 평원",
      objective: "모든 적 격파",
      defeatCondition: "all_allies_down",
      mapTiles: MAP_TEMPLATE,
      allySpawns: ALLY_SPAWNS,
      enemySpawns: ENEMY_SPAWN_CANDIDATES,
      enemyBonus: 1,
      rewardGold: 120,
      introLines: [
        "리아: 첫 실전이지만 물러설 수 없어. 전열을 정비해.",
        "도윤: 우측 숲을 조심해. 적 지휘관이 평원을 내려다보고 있다."
      ],
      boss: {
        id: "boss-prologue",
        name: "에단",
        title: "평원 약탈단 두목",
        className: "검사",
        weaponType: "sword",
        spawn: { x: 11, y: 1 },
        levelBonus: 2,
        maxHpBonus: 4,
        statBonuses: { str: 2, skl: 1, spd: 1, def: 1 },
        movBonus: 0,
        specialSkillIds: ["warlord_presence"],
        specialActiveSkillIds: ["boss_cleave"],
        fixedDrop: {
          idPrefix: "reward-plains-sword",
          name: "평원 지휘검",
          slot: "weapon",
          type: "sword",
          rarity: "uncommon",
          might: 7,
          hit: 90,
          rangeMin: 1,
          rangeMax: 1,
          uses: 36
        }
      },
      victoryCondition: "route_enemy",
      cutsceneTitle: "프롤로그 작전 회의",
      events: [
        {
          id: "prologue-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "에단: 건방진 신병들이군. 진짜 칼맛을 보여주마."
          ]
        },
        {
          id: "prologue-boss-down",
          trigger: "boss_defeated",
          lines: [
            "리아: 지휘관이 무너졌다. 남은 적을 정리하자."
          ]
        }
      ]
    },
    {
      id: "timber-ridge",
      name: "목재 능선",
      objective: "감시대장 격파 또는 적 전멸",
      mapTiles: [
        ["plain", "forest", "forest", "hill", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "plain"],
        ["plain", "forest", "wall", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "wall", "plain", "forest", "wall", "hill", "plain", "plain", "plain", "forest", "plain"],
        ["plain", "plain", "plain", "plain", "forest", "plain", "plain", "plain", "wall", "plain", "plain", "plain"],
        ["plain", "wall", "plain", "plain", "plain", "plain", "forest", "plain", "wall", "plain", "hill", "plain"],
        ["plain", "wall", "plain", "forest", "plain", "hill", "forest", "plain", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
      ],
      allySpawns: ALLY_SPAWNS,
      enemySpawns: [
        { x: 9, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 2 },
        { x: 9, y: 3 },
        { x: 11, y: 2 },
        { x: 10, y: 4 }
      ],
      enemyBonus: 1,
      rewardGold: 170,
      introLines: [
        "세라: 능선 위 궁수들이 보여. 섣불리 올라가면 집중 사격을 받아.",
        "리아: 숲을 엄폐물로 써서 전진한다. 지휘관부터 끊어."
      ],
      boss: {
        id: "boss-ridge",
        name: "바르카",
        title: "능선 감시대장",
        className: "헌터",
        weaponType: "bow",
        spawn: { x: 11, y: 1 },
        levelBonus: 2,
        maxHpBonus: 5,
        statBonuses: { str: 2, skl: 2, spd: 1, def: 1 },
        movBonus: 0,
        specialSkillIds: ["eagle_commander"],
        specialActiveSkillIds: ["rain_of_arrows"],
        fixedDrop: {
          idPrefix: "reward-ridge-bow",
          name: "능선 사냥활",
          slot: "weapon",
          type: "bow",
          rarity: "rare",
          might: 8,
          hit: 94,
          rangeMin: 2,
          rangeMax: 2,
          uses: 34
        }
      },
      victoryCondition: "boss_or_route",
      cutsceneTitle: "능선 돌파 브리핑",
      events: [
        {
          id: "ridge-turn-3",
          trigger: "turn_start",
          turn: 3,
          phase: "player",
          lines: [
            "도윤: 능선 위 시야가 넓다. 더 늦기 전에 우측을 압박하자."
          ]
        },
        {
          id: "ridge-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "바르카: 이 정도로 능선을 넘을 수 있을 거라 생각했나?"
          ]
        },
        {
          id: "ridge-boss-down",
          trigger: "boss_defeated",
          lines: [
            "세라: 감시대장이 쓰러졌어. 활줄 소리가 줄어들고 있어."
          ]
        }
      ]
    },
    {
      id: "red-fort",
      name: "붉은 성채 외곽",
      objective: "성채 수비대장 격파",
      mapTiles: [
        ["plain", "plain", "hill", "plain", "wall", "wall", "plain", "plain", "plain", "plain", "plain", "plain"],
        ["plain", "forest", "plain", "plain", "wall", "wall", "plain", "forest", "forest", "plain", "plain", "plain"],
        ["plain", "forest", "plain", "plain", "plain", "plain", "plain", "wall", "plain", "plain", "hill", "plain"],
        ["plain", "plain", "wall", "wall", "plain", "forest", "hill", "wall", "plain", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "wall", "plain", "forest", "plain", "plain", "plain", "plain", "forest", "plain"],
        ["plain", "wall", "plain", "plain", "plain", "plain", "plain", "plain", "wall", "plain", "plain", "plain"],
        ["plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain", "plain"]
      ],
      allySpawns: ALLY_SPAWNS,
      enemySpawns: [
        { x: 8, y: 1 },
        { x: 9, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 2 },
        { x: 9, y: 4 },
        { x: 11, y: 3 }
      ],
      enemyBonus: 2,
      rewardGold: 220,
      introLines: [
        "리아: 저 앞이 성채 외곽이야. 여기서 밀리면 다음은 없다.",
        "도윤: 중앙 벽을 넘기보다 좌측 통로를 열고 보스를 고립시키자."
      ],
      boss: {
        id: "boss-fort",
        name: "그라드",
        title: "성채 수비대장",
        className: "솔저",
        weaponType: "lance",
        spawn: { x: 11, y: 1 },
        levelBonus: 3,
        maxHpBonus: 7,
        statBonuses: { str: 2, skl: 1, spd: 1, def: 3 },
        movBonus: 1,
        specialSkillIds: ["fortress_heart"],
        specialActiveSkillIds: ["guard_roar"],
        fixedDrop: {
          idPrefix: "reward-fort-charm",
          name: "성채 수호 인장",
          slot: "charm",
          type: "charm",
          rarity: "unique",
          statBonus: {
            def: 2,
            maxHp: 2
          }
        }
      },
      victoryCondition: "boss_defeat",
      cutsceneTitle: "성채 외곽 강습",
      events: [
        {
          id: "fort-turn-4",
          trigger: "turn_start",
          turn: 4,
          phase: "player",
          lines: [
            "리아: 성채 문 앞에서 시간을 끌수록 불리해. 지금 밀어붙여."
          ]
        },
        {
          id: "fort-boss-half",
          trigger: "boss_hp_half",
          lines: [
            "그라드: 외곽을 뚫었다고 끝난 줄 아나. 여기서 전부 묻어주마."
          ]
        },
        {
          id: "fort-boss-down",
          trigger: "boss_defeated",
          lines: [
            "도윤: 수비대장이 무너졌다. 성채 외곽 진형이 흔들린다."
          ]
        }
      ]
    }
  ];

  const RECRUIT_DEFINITIONS = {
    "prologue-field": [
      {
        unit: {
          id: "ally-4",
          name: "유진",
          team: "ally",
          className: "검사",
          level: 1,
          exp: 0,
          hp: 17,
          maxHp: 17,
          str: 6,
          skl: 7,
          spd: 7,
          def: 3,
          mov: 5,
          x: 0,
          y: 0,
          acted: false,
          alive: true,
          weapon: "recruit-sword-01",
          statPoints: 1,
          equippedItemIds: ["recruit-sword-01"]
        },
        items: [
          {
            id: "recruit-sword-01",
            name: "용병 철검",
            type: "sword",
            slot: "weapon",
            might: 5,
            hit: 88,
            rangeMin: 1,
            rangeMax: 1,
            uses: 38,
            rarity: "common",
            equippedBy: "ally-4"
          }
        ]
      }
    ],
    "timber-ridge": [
      {
        unit: {
          id: "ally-5",
          name: "하린",
          team: "ally",
          className: "헌터",
          level: 2,
          exp: 0,
          hp: 18,
          maxHp: 18,
          str: 6,
          skl: 8,
          spd: 6,
          def: 3,
          mov: 5,
          x: 0,
          y: 0,
          acted: false,
          alive: true,
          weapon: "recruit-bow-01",
          statPoints: 1,
          equippedItemIds: ["recruit-bow-01"]
        },
        items: [
          {
            id: "recruit-bow-01",
            name: "정찰 활",
            type: "bow",
            slot: "weapon",
            might: 5,
            hit: 90,
            rangeMin: 2,
            rangeMax: 2,
            uses: 34,
            rarity: "uncommon",
            equippedBy: "ally-5"
          }
        ]
      }
    ]
  };

  const ENDLESS_CONTACT_RECRUITS = {
    rift_mercenary: {
      unit: {
        id: "rift-recruit-mercenary",
        name: "카인",
        team: "ally",
        className: "검사",
        level: 3,
        exp: 0,
        hp: 18,
        maxHp: 18,
        str: 7,
        skl: 7,
        spd: 6,
        def: 4,
        mov: 5,
        x: 0,
        y: 0,
        acted: false,
        alive: true,
        weapon: "rift-recruit-mercenary-sword",
        guildRank: "B",
        potentialScore: 58,
        trainingLevel: 1,
        trainingAttempts: 0,
        statPoints: 1,
        skillPoints: 1,
        equippedItemIds: ["rift-recruit-mercenary-sword"]
      },
      items: [
        {
          id: "rift-recruit-mercenary-sword",
          name: "균열 용병검",
          type: "sword",
          slot: "weapon",
          might: 7,
          hit: 90,
          rangeMin: 1,
          rangeMax: 1,
          uses: 42,
          rarity: "rare",
          equippedBy: "rift-recruit-mercenary"
        }
      ]
    },
    rift_scout: {
      unit: {
        id: "rift-recruit-scout",
        name: "세린",
        team: "ally",
        className: "헌터",
        level: 3,
        exp: 0,
        hp: 17,
        maxHp: 17,
        str: 6,
        skl: 8,
        spd: 7,
        def: 3,
        mov: 5,
        x: 0,
        y: 0,
        acted: false,
        alive: true,
        weapon: "rift-recruit-scout-bow",
        guildRank: "B",
        potentialScore: 61,
        trainingLevel: 1,
        trainingAttempts: 0,
        statPoints: 1,
        skillPoints: 1,
        equippedItemIds: ["rift-recruit-scout-bow"]
      },
      items: [
        {
          id: "rift-recruit-scout-bow",
          name: "균열 정찰활",
          type: "bow",
          slot: "weapon",
          might: 6,
          hit: 92,
          rangeMin: 2,
          rangeMax: 2,
          uses: 38,
          rarity: "rare",
          equippedBy: "rift-recruit-scout"
        }
      ]
    }
  };

  const ENDLESS_CONTACT_EVENTS = {
    wandering_mercenary: {
      id: "wandering_mercenary",
      markerType: "npc",
      markerLabel: "용병",
      title: "길 잃은 용병",
      prompt: "무너진 벽 틈에서 부상당한 용병이 손을 든다. 아직 싸울 의지는 남아 있는 듯하다."
    },
    lost_scout: {
      id: "lost_scout",
      markerType: "npc",
      markerLabel: "정찰",
      title: "실종된 정찰병",
      prompt: "균열 안쪽에서 길을 잃은 정찰병이 지도를 움켜쥔 채 구조를 요청한다."
    },
    sealed_anvil: {
      id: "sealed_anvil",
      markerType: "site",
      markerLabel: "공방",
      title: "봉인된 모루",
      prompt: "오래된 균열 공방의 모루가 미약한 열기를 뿜는다. 건드리면 장비를 손볼 수 있을 것 같다."
    },
    whisper_shrine: {
      id: "whisper_shrine",
      markerType: "site",
      markerLabel: "제단",
      title: "속삭이는 제단",
      prompt: "붕괴한 제단에서 균열의 목소리가 들려온다. 대가를 치르면 축복을 얻을 수 있을지 모른다."
    },
    buried_cache: {
      id: "buried_cache",
      markerType: "site",
      markerLabel: "보급",
      title: "매몰된 보급고",
      prompt: "잔해 아래 숨겨진 보급 상자가 보인다. 무리해서라도 열어볼 가치가 있어 보인다."
    },
    echo_mirror: {
      id: "echo_mirror",
      markerType: "site",
      markerLabel: "거울",
      title: "회귀의 거울",
      prompt: "균열 속 거울이 파티의 전투 기억을 비춘다. 비친 기억을 손대면 성장의 흐름이나 투자 방향까지 흔들 수 있을 것 같다."
    },
    veteran_mentor: {
      id: "veteran_mentor",
      markerType: "npc",
      markerLabel: "교관",
      title: "균열의 교관",
      prompt: "낡은 군복을 입은 베테랑이 전장을 훑어보며 선다. 아직 손끝에 남은 전술과 단련법을 넘겨줄 수 있다고 한다."
    },
    rift_medic: {
      id: "rift_medic",
      markerType: "npc",
      markerLabel: "의무",
      title: "균열 의무관",
      prompt: "붕대와 약품 냄새를 풍기는 의무관이 부상자를 살핀다. 상처를 꿰매는 대가로 오래 남을 처방도 내릴 수 있다고 한다."
    },
    shattered_observatory: {
      id: "shattered_observatory",
      markerType: "site",
      markerLabel: "관측",
      title: "부서진 관측소",
      prompt: "무너진 천문 관측소의 렌즈가 균열 심부를 비춘다. 별흔을 읽어내면 전술이나 잠재를 끌어올릴 수 있을 것 같다."
    }
  };

  const subscribers = [];
  const state = {
    active: false,
    userId: null,
    saveData: null,
    settings: null,
    battle: null,
    ui: {
      selectedUnitId: null,
      reachableTiles: [],
      attackTiles: [],
      attackableTargetIds: [],
      pendingAttack: false,
      skillTiles: [],
      skillTargetIds: [],
      pendingMove: null,
      movePreview: null,
      pendingSkillId: null,
      activePanel: "unit"
    }
  };

  function clone(value) {
    return StorageService.cloneValue(value);
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function subscribe(listener) {
    subscribers.push(listener);
    return function unsubscribe() {
      const index = subscribers.indexOf(listener);

      if (index >= 0) {
        subscribers.splice(index, 1);
      }
    };
  }

  function notify() {
    const snapshot = getSnapshot();
    subscribers.forEach((listener) => listener(snapshot));
  }

  function getBaseTileElevation(tileType) {
    return TILE_ELEVATION_BY_TYPE[tileType] || 0;
  }

  function buildElevationMap(mapTiles) {
    return mapTiles.map((row) => row.map((tileType) => getBaseTileElevation(tileType)));
  }

  function padMapRows(rows, fallbackValue) {
    const sourceRows = Array.isArray(rows) ? clone(rows) : [];
    const paddedRows = [];

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      const sourceRow = Array.isArray(sourceRows[y]) ? sourceRows[y].slice(0, MAP_WIDTH) : [];
      const nextRow = [];

      for (let x = 0; x < MAP_WIDTH; x += 1) {
        nextRow.push(sourceRow[x] !== undefined ? sourceRow[x] : fallbackValue);
      }

      paddedRows.push(nextRow);
    }

    return paddedRows;
  }

  function normalizeBattleMap(map) {
    const normalizedMap = Object.assign({
      id: state.saveData ? state.saveData.stageId : "map",
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles: []
    }, clone(map || {}));

    normalizedMap.tiles = padMapRows(normalizedMap.tiles, "plain");
    normalizedMap.width = MAP_WIDTH;
    normalizedMap.height = MAP_HEIGHT;
    normalizedMap.elevations = Array.isArray(normalizedMap.elevations) && normalizedMap.elevations.length
      ? padMapRows(normalizedMap.elevations, 0)
      : buildElevationMap(normalizedMap.tiles);
    normalizedMap.markers = clone(normalizedMap.markers || []);
    return normalizedMap;
  }

  function getTileType(x, y) {
    if (!state.battle || y < 0 || y >= state.battle.map.height || x < 0 || x >= state.battle.map.width) {
      return "void";
    }

    return state.battle.map.tiles[y][x];
  }

  function getTileElevation(x, y) {
    if (!isTileInside(x, y)) {
      return 0;
    }

    return state.battle.map.elevations && state.battle.map.elevations[y]
      ? state.battle.map.elevations[y][x] || 0
      : getBaseTileElevation(getTileType(x, y));
  }

  function getTileMovementCost(x, y) {
    const terrain = CombatService.getTerrainModifier(getTileType(x, y));
    return Number.isFinite(terrain.moveCost) ? terrain.moveCost : Infinity;
  }

  function isTileInside(x, y) {
    return !!state.battle && x >= 0 && x < state.battle.map.width && y >= 0 && y < state.battle.map.height;
  }

  function isTilePassable(x, y) {
    return isTileInside(x, y) && getTileType(x, y) !== "wall" && !isObjectiveTile(x, y);
  }

  function getAliveUnitsByTeam(team) {
    return state.battle.units.filter((unit) => unit.team === team && unit.alive);
  }

  function getUnitById(unitId) {
    return state.battle.units.find((unit) => unit.id === unitId) || null;
  }

  function getUnitAt(x, y) {
    return state.battle.units.find((unit) => unit.alive && unit.x === x && unit.y === y) || null;
  }

  function getPersistentUnit(unitId) {
    return (state.saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function getSelectedPartyUnits() {
    const selectedIds = (state.saveData.selectedPartyIds || []).slice(0, ALLY_SPAWNS.length);
    const leaderId = state.saveData.leaderUnitId;
    const orderedIds = leaderId && selectedIds.includes(leaderId)
      ? [leaderId].concat(selectedIds.filter((unitId) => unitId !== leaderId))
      : selectedIds;
    const selectedUnits = orderedIds
      .map((unitId) => getPersistentUnit(unitId))
      .filter(Boolean);

    if (selectedUnits.length) {
      return selectedUnits;
    }

    return (state.saveData.roster || []).slice(0, ALLY_SPAWNS.length);
  }

  function applyEndlessRelicsToUnit(unit) {
    if (!state.saveData || state.saveData.stageId !== ENDLESS_STAGE_ID) {
      return unit;
    }

    ensureEndlessState().relicIds.forEach((relicId) => {
      const relic = ENDLESS_RELICS[relicId];

      if (relic && typeof relic.apply === "function") {
        relic.apply(unit);
      }
    });

    return unit;
  }

  function getPersistentItem(itemId) {
    return InventoryService.getItemById(state.saveData, itemId);
  }

  function grantPersistentExperience(unit, amount) {
    if (!unit || !amount) {
      return;
    }

    unit.exp += amount;

    while (unit.exp >= 100) {
      const previousLevel = unit.level;
      unit.exp -= 100;
      unit.level += 1;
      const gains = StatsService.rollLevelGains(unit, 5);
      StatsService.applyLevelGains(unit, gains);
      unit.statPoints = (unit.statPoints || 0) + 1;
      unit.skillPoints = (unit.skillPoints || 0) + 1;
      addLog(
        `${unit.name} 훈련 성과! Lv.${unit.level} / 성장: ${StatsService.describeLevelGains(gains)}`
      );
      addLog(`${unit.name} 스탯 포인트 +1 / 스킬 포인트 +1`);

      SkillsService.getNewlyUnlockedSkills(unit.className, previousLevel, unit.level).forEach((skill) => {
        addLog(`${unit.name} 학습 가능 스킬: ${skill.name}`);
      });

      SkillsService.getNewlyUnlockedActiveSkills(unit.className, previousLevel, unit.level).forEach((skill) => {
        addLog(`${unit.name} 학습 가능 액티브: ${skill.name}`);
      });
    }
  }

  function grantPartyExperience(amount) {
    getSelectedPartyUnits().forEach((unit) => grantPersistentExperience(unit, amount));
  }

  function repairSelectedPartyWeapons(amount) {
    let repairedCount = 0;

    getSelectedPartyUnits().forEach((unit) => {
      if (!unit.weapon) {
        return;
      }

      const item = getPersistentItem(typeof unit.weapon === "string" ? unit.weapon : unit.weapon.id);

      if (!item || item.slot !== "weapon") {
        return;
      }

      item.uses = (item.uses || 0) + amount;
      repairedCount += 1;
    });

    return repairedCount;
  }

  function grantEventConsumables() {
    const items = [
      InventoryService.buildShopItem("shop-potion"),
      InventoryService.buildShopItem("shop-potion"),
      InventoryService.buildShopItem("shop-hi-potion")
    ];

    items.forEach((item) => {
      InventoryService.addItemToInventory(state.saveData, item);
      state.battle.rewardHistory.push(item);
    });
    return items;
  }

  function grantEventLoot(level) {
    const item = InventoryService.createLootDrop(level);
    InventoryService.addItemToInventory(state.saveData, item);
    state.battle.rewardHistory.push(item);
    updateEndlessRunStat((currentRun) => {
      currentRun.itemsLooted += 1;
    });
    return item;
  }

  function startEventChain(chainId) {
    const currentRun = ensureEndlessRunState();
    const chain = ENDLESS_EVENT_CHAINS[chainId];

    if (!chain) {
      throw new Error("알 수 없는 연속 사건입니다.");
    }

    currentRun.chainState = {
      id: chainId,
      name: chain.name,
      startedFloor: state.battle ? state.battle.endlessFloor : ensureEndlessState().currentFloor,
      pending: true
    };
    return currentRun.chainState;
  }

  function clearEventChain() {
    const currentRun = ensureEndlessRunState();
    currentRun.chainState = null;
  }

  function grantFixedItems(itemIds) {
    const granted = [];

    (itemIds || []).forEach((itemId) => {
      const item = InventoryService.buildShopItem(itemId);

      if (!item) {
        return;
      }

      InventoryService.addItemToInventory(state.saveData, item);
      state.battle.rewardHistory.push(item);
      granted.push(item);
    });

    return granted;
  }

  function grantPartyStatPoints(amount) {
    getSelectedPartyUnits().forEach((unit) => {
      unit.statPoints = Math.max(0, Number(unit.statPoints || 0)) + Number(amount || 0);
    });
  }

  function grantPartySkillPoints(amount) {
    getSelectedPartyUnits().forEach((unit) => {
      unit.skillPoints = Math.max(0, Number(unit.skillPoints || 0)) + Number(amount || 0);
    });
  }

  function grantPartyPermanentPrimaryGains(gains) {
    const normalizedGains = gains || {};

    getSelectedPartyUnits().forEach((unit) => {
      StatsService.applyLevelGains(unit, normalizedGains);
    });
  }

  function grantLeaderPermanentPrimaryGains(gains) {
    const leader = getPersistentUnit(state.saveData && state.saveData.leaderUnitId);

    if (!leader) {
      return;
    }

    StatsService.applyLevelGains(leader, gains || {});
  }

  function grantPartyPotentialScore(amount) {
    getSelectedPartyUnits().forEach((unit) => {
      StatsService.grantPotentialScore(unit, amount || 0);
    });
  }

  function grantPartyTrainingLevels(amount) {
    getSelectedPartyUnits().forEach((unit) => {
      StatsService.grantTrainingLevel(unit, amount || 0);
    });
  }

  function restoreSelectedPartyHealth(amount, fullRestore) {
    let restoredCount = 0;

    getSelectedPartyUnits().forEach((persistentUnit) => {
      const targetAmount = fullRestore
        ? Math.max(0, Number(persistentUnit.maxHp || 0) - Number(persistentUnit.hp || 0))
        : Math.max(0, Number(amount || 0));
      const healed = Math.min(targetAmount, Math.max(0, Number(persistentUnit.maxHp || 0) - Number(persistentUnit.hp || 0)));

      if (healed <= 0) {
        return;
      }

      persistentUnit.hp = Math.min(persistentUnit.maxHp, Number(persistentUnit.hp || 0) + healed);
      const battleUnit = getUnitById(persistentUnit.id);

      if (battleUnit) {
        battleUnit.hp = Math.min(battleUnit.maxHp, Number(battleUnit.hp || 0) + healed);
      }

      restoredCount += 1;
    });

    return restoredCount;
  }

  function applyEndlessGrowthChoice(choice, labelPrefix) {
    const prefix = labelPrefix || "이벤트";

    if (choice.primaryStatGains) {
      grantPartyPermanentPrimaryGains(choice.primaryStatGains);
      addLog(`${prefix} 영구 성장: 출전 파티 ${StatsService.describeLevelGains(choice.primaryStatGains)}`);
    }

    if (choice.leaderPrimaryStatGains) {
      grantLeaderPermanentPrimaryGains(choice.leaderPrimaryStatGains);
      addLog(`${prefix} 영구 성장: 리더 ${StatsService.describeLevelGains(choice.leaderPrimaryStatGains)}`);
    }

    if ((choice.potentialScoreAmount || 0) > 0) {
      grantPartyPotentialScore(choice.potentialScoreAmount || 0);
      addLog(`${prefix} 영구 성장: 출전 파티 잠재 점수 +${choice.potentialScoreAmount}`);
    }

    if ((choice.trainingLevelAmount || 0) > 0) {
      grantPartyTrainingLevels(choice.trainingLevelAmount || 0);
      addLog(`${prefix} 영구 성장: 출전 파티 훈련 레벨 +${choice.trainingLevelAmount}`);
    }
  }

  function syncSelectedBattleUnitsFromPersistent() {
    getSelectedPartyUnits().forEach((unit) => {
      syncBattleUnitEquipmentState(unit.id);
    });
  }

  function grantEncounterRecruit(templateId, floor) {
    const template = ENDLESS_CONTACT_RECRUITS[templateId];

    if (!template) {
      throw new Error("합류시킬 모험가 정보를 찾을 수 없습니다.");
    }

    const recruitUnit = clone(template.unit);
    const recruitItems = clone(template.items || []);
    const suffix = `${floor || 1}-${Math.floor(Math.random() * 100000)}`;
    const originalUnitId = recruitUnit.id;
    const targetLevel = Math.max(recruitUnit.level || 1, Math.min(12, Number(floor || 1) + 1));

    recruitUnit.id = `${recruitUnit.id}-${suffix}`;
    recruitUnit.weapon = recruitItems[0] ? `${recruitItems[0].id}-${suffix}` : null;
    recruitUnit.equippedItemIds = recruitItems.map((item) => `${item.id}-${suffix}`);
    recruitUnit.hiredAt = new Date().toISOString();

    recruitItems.forEach((item) => {
      item.id = `${item.id}-${suffix}`;
      item.equippedBy = recruitUnit.id;
    });

    StatsService.normalizeUnitProgression(recruitUnit);
    SkillsService.normalizeUnitLearnedSkills(recruitUnit);

    for (let currentLevel = (recruitUnit.level || 1) + 1; currentLevel <= targetLevel; currentLevel += 1) {
      StatsService.applyLevelGains(recruitUnit, StatsService.rollLevelGains(recruitUnit, 5));
      recruitUnit.level = currentLevel;
    }

    recruitUnit.hp = recruitUnit.maxHp;
    state.saveData.roster = state.saveData.roster || [];
    state.saveData.inventory = state.saveData.inventory || [];
    state.saveData.roster.push(recruitUnit);
    recruitItems.forEach((item) => InventoryService.addItemToInventory(state.saveData, item));

    if ((state.saveData.selectedPartyIds || []).length < ALLY_SPAWNS.length) {
      state.saveData.selectedPartyIds.push(recruitUnit.id);
    }

    return {
      unit: recruitUnit,
      items: recruitItems,
      templateId,
      originalUnitId
    };
  }

  function buildContactChoiceSet(encounterId, floor) {
    const normalizedFloor = Math.max(1, Number(floor || 1));
    const goldBase = 60 + normalizedFloor * 10;
    const expBase = 16 + normalizedFloor * 2;
    const repairBase = 8 + Math.floor(normalizedFloor / 2);

    if (encounterId === "wandering_mercenary") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "recruit_mercenary",
            title: "동행을 제안한다",
            description: `${120 + normalizedFloor * 8}G를 건네고 검사를 파티에 합류시킨다.`,
            goldCost: 120 + normalizedFloor * 8,
            recruitTemplateId: "rift_mercenary"
          },
          {
            id: "buy_field_supplies",
            title: "남은 보급을 사들인다",
            description: `${90 + normalizedFloor * 6}G를 내고 고급 물약과 장비 정비를 받는다.`,
            goldCost: 90 + normalizedFloor * 6,
            fixedItemIds: ["shop-hi-potion", "shop-potion"],
            repairAmount: repairBase
          },
          {
            id: "guide_and_move_on",
            title: "길만 알려주고 보낸다",
            description: `${goldBase}G를 받고 서로 갈 길을 간다.`,
            goldReward: goldBase
          }
        ]
      };
    }

    if (encounterId === "lost_scout") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "rescue_scout",
            title: "구조해 파티에 합류시킨다",
            description: "정찰병이 감사의 뜻으로 활을 들고 합류한다.",
            recruitTemplateId: "rift_scout"
          },
          {
            id: "take_route_notes",
            title: "정찰 기록만 받는다",
            description: `출전 파티 전원이 EXP ${expBase}와 스킬 포인트 +1을 얻는다.`,
            expReward: expBase,
            skillPointAmount: 1
          },
          {
            id: "escort_to_exit",
            title: "탈출로를 열어준다",
            description: `${goldBase + 30}G와 회복 물약 1개를 받는다.`,
            goldReward: goldBase + 30,
            fixedItemIds: ["shop-potion"]
          }
        ]
      };
    }

    if (encounterId === "sealed_anvil") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "reforge_weapons",
            title: "무기를 재단련한다",
            description: `장착 무기 내구를 ${repairBase + 4} 회복하고 랜덤 장비 1개를 얻는다.`,
            repairAmount: repairBase + 4,
            lootLevel: normalizedFloor + 2
          },
          {
            id: "salvage_fragments",
            title: "파편만 회수한다",
            description: `${goldBase + 20}G와 수호 부적 1개를 확보한다.`,
            goldReward: goldBase + 20,
            fixedItemIds: ["shop-guardian-charm"]
          },
          {
            id: "leave_anvil",
            title: "공방을 지나친다",
            description: "위험을 감수하지 않고 그대로 통과한다."
          }
        ]
      };
    }

    if (encounterId === "echo_mirror") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "mirror_rethread",
            title: "기억을 되감는다",
            description: "기억 재편 두루마리와 직업 변경의 서를 얻는다. 스탯 재분배와 병종 재편이 가능해진다.",
            fixedItemIds: ["shop-stat-reset-scroll", "shop-class-change-scroll"]
          },
          {
            id: "mirror_awaken",
            title: "잠재를 비춘다",
            description: "출전 파티 전원의 잠재 점수 +4, EXP 소량 획득.",
            potentialScoreAmount: 4,
            expReward: Math.floor(expBase / 2)
          },
          {
            id: "mirror_graft",
            title: "전투 감각을 이식한다",
            description: "리더의 STR+1, DEX+1, LUK+1 영구 상승.",
            leaderPrimaryStatGains: { str: 1, dex: 1, luk: 1 }
          }
        ]
      };
    }

    if (encounterId === "veteran_mentor") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "mentor_field_drill",
            title: "실전 훈련을 받는다",
            description: "출전 파티 전원의 STR+1, VIT+1 영구 상승.",
            primaryStatGains: { str: 1, vit: 1 }
          },
          {
            id: "mentor_growth_route",
            title: "성장 경로를 전수받는다",
            description: "출전 파티 전원의 훈련 레벨 +1, 스킬 포인트 +1.",
            trainingLevelAmount: 1,
            skillPointAmount: 1
          },
          {
            id: "mentor_tactical_cache",
            title: "전술 메모와 보급을 받는다",
            description: `EXP ${expBase}와 직업 변경의 서 1개를 확보한다.`,
            expReward: expBase,
            fixedItemIds: ["shop-class-change-scroll"]
          }
        ]
      };
    }

    if (encounterId === "rift_medic") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "medic_emergency_aid",
            title: "응급 처치를 맡긴다",
            description: "출전 파티 전원의 HP를 전부 회복하고 회복 물약 1개를 받는다.",
            fullRecoverParty: true,
            fixedItemIds: ["shop-potion"]
          },
          {
            id: "medic_rehab_course",
            title: "재활 처방을 받는다",
            description: "출전 파티 전원의 VIT+1 영구 상승과 훈련 레벨 +1.",
            primaryStatGains: { vit: 1 },
            trainingLevelAmount: 1
          },
          {
            id: "medic_supply_swap",
            title: "약품만 거래한다",
            description: `${goldBase}G를 내고 고급 물약 2개와 기억 재편 두루마리 1개를 얻는다.`,
            goldCost: goldBase,
            fixedItemIds: ["shop-hi-potion", "shop-hi-potion", "shop-stat-reset-scroll"]
          }
        ]
      };
    }

    if (encounterId === "shattered_observatory") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "observatory_star_chart",
            title: "별흔 지도를 해독한다",
            description: "출전 파티 전원의 잠재 점수 +3과 랜덤 장비 1개를 얻는다.",
            potentialScoreAmount: 3,
            lootLevel: normalizedFloor + 2
          },
          {
            id: "observatory_focus_lens",
            title: "조준 렌즈를 맞춘다",
            description: "출전 파티 전원의 DEX+1, LUK+1 영구 상승.",
            primaryStatGains: { dex: 1, luk: 1 }
          },
          {
            id: "observatory_logbook",
            title: "관측 일지만 챙긴다",
            description: `EXP ${expBase}와 스킬 포인트 +1, ${goldBase + 20}G를 획득한다.`,
            expReward: expBase,
            skillPointAmount: 1,
            goldReward: goldBase + 20
          }
        ]
      };
    }

    if (encounterId === "whisper_shrine") {
      return {
        title: ENDLESS_CONTACT_EVENTS[encounterId].title,
        description: ENDLESS_CONTACT_EVENTS[encounterId].prompt,
        choices: [
          {
            id: "accept_blessing",
            title: "속삭임을 받아들인다",
            description: "출전 파티 전원의 INT+1, LUK+1 영구 상승과 스킬 포인트 +1.",
            primaryStatGains: { int: 1, luk: 1 },
            skillPointAmount: 1
          },
          {
            id: "offer_gold",
            title: "공물을 바친다",
            description: `${80 + normalizedFloor * 8}G를 바치고 잠재 점수 +3과 추가 전리품을 얻는다.`,
            goldCost: 80 + normalizedFloor * 8,
            lootLevel: normalizedFloor + 1,
            expReward: Math.floor(expBase / 2),
            potentialScoreAmount: 3
          },
          {
            id: "refuse_shrine",
            title: "제단을 거절한다",
            description: "축복도 대가도 없이 물러난다."
          }
        ]
      };
    }

    return {
      title: ENDLESS_CONTACT_EVENTS.buried_cache.title,
      description: ENDLESS_CONTACT_EVENTS.buried_cache.prompt,
      choices: [
        {
          id: "open_cache",
          title: "보급고를 개방한다",
          description: `${goldBase + 40}G와 랜덤 장비 1개를 획득한다.`,
          goldReward: goldBase + 40,
          lootLevel: normalizedFloor + 1
        },
        {
          id: "sort_supplies",
          title: "보급만 챙긴다",
          description: "회복 물약 2개와 고급 물약 1개를 확보한다.",
          fixedItemIds: ["shop-potion", "shop-potion", "shop-hi-potion"]
        },
        {
          id: "mark_cache",
          title: "위치만 기록한다",
          description: `출전 파티 전원이 EXP ${Math.floor(expBase / 2)}를 얻고 DEX+1이 영구 상승한다.`,
          expReward: Math.floor(expBase / 2),
          primaryStatGains: { dex: 1 }
        }
      ]
    };
  }

  function resolveEventChain(choice) {
    const chainState = getCurrentEndlessChainState();

    if (!chainState || !choice || choice.chainId !== chainState.id) {
      throw new Error("진행 중인 연속 사건과 맞지 않는 선택입니다.");
    }

    if (choice.chainId === "merchant_caravan") {
      const goldReward = 120 + (state.battle.endlessFloor || 1) * 12;
      const item = grantEventLoot((state.battle.endlessFloor || 1) + 2);
      const potion = InventoryService.buildShopItem("shop-hi-potion");
      state.saveData.partyGold += goldReward;
      InventoryService.addItemToInventory(state.saveData, potion);
      state.battle.rewardHistory.push(potion);
      updateEndlessRunStat((currentRun) => {
        currentRun.goldEarned += goldReward;
      });
      addLog(`연속 사건 완료: ${goldReward}G와 ${item.name}, ${potion.name} 확보`);
    }

    if (choice.chainId === "altar_echo") {
      if (choice.relicId && !state.saveData.endless.relicIds.includes(choice.relicId)) {
        state.saveData.endless.relicIds.push(choice.relicId);
        updateEndlessRunStat((currentRun) => {
          currentRun.relicsCollected += 1;
        });
        addLog(`연속 사건 완료: ${choice.relicTitle}의 힘을 흡수했다.`);
      } else {
        getSelectedPartyUnits().forEach((unit) => {
          unit.statPoints = (unit.statPoints || 0) + 2;
        });
        addLog("연속 사건 완료: 출전 파티 전원의 스탯 포인트 +2");
      }
    }

    if (choice.chainId === "fallen_banner") {
      grantPartyExperience(24 + (state.battle.endlessFloor || 1) * 2);
      repairSelectedPartyWeapons(10 + Math.floor((state.battle.endlessFloor || 1) / 2));
      getSelectedPartyUnits().forEach((unit) => {
        unit.statPoints = (unit.statPoints || 0) + 1;
      });
      addLog("연속 사건 완료: 전투 경험과 정비 효과를 얻었다.");
    }

    if (choice.chainId === "sealed_workshop") {
      const weapon = grantEventLoot((state.battle.endlessFloor || 1) + 3);
      const repaired = repairSelectedPartyWeapons(12 + Math.floor((state.battle.endlessFloor || 1) / 2));
      const consumables = grantEventConsumables();
      addLog(`연속 사건 완료: ${weapon.name} 확보, 무기 ${repaired}개 정비, ${consumables.length}개 보급품 확보`);
    }

    if (choice.chainId === "lost_patrol") {
      const goldReward = 140 + (state.battle.endlessFloor || 1) * 10;
      state.saveData.partyGold += goldReward;
      grantPartyExperience(20 + (state.battle.endlessFloor || 1) * 2);
      getSelectedPartyUnits().forEach((unit) => {
        unit.statPoints = (unit.statPoints || 0) + 1;
      });
      updateEndlessRunStat((currentRun) => {
        currentRun.goldEarned += goldReward;
      });
      addLog(`연속 사건 완료: ${goldReward}G, 전술 경험, 스탯 포인트 +1 획득`);
    }

    clearEventChain();
  }

  function ensureCampaignState() {
    state.saveData.campaign = state.saveData.campaign || {
      currentStageIndex: 0,
      clearedStageIds: [],
      availableStageIds: [STAGE_DEFINITIONS[0].id],
      lastResult: null
    };

    return state.saveData.campaign;
  }

  function ensureEndlessState() {
    state.saveData.endless = state.saveData.endless || {
      currentFloor: 1,
      bestFloor: 1,
      relicIds: [],
      currentRun: null,
      lastRun: null
    };
    state.saveData.endless.currentFloor = Math.max(1, Number(state.saveData.endless.currentFloor || 1));
    state.saveData.endless.bestFloor = Math.max(
      state.saveData.endless.currentFloor,
      Number(state.saveData.endless.bestFloor || 1)
    );
    state.saveData.endless.relicIds = clone(state.saveData.endless.relicIds || []);
    state.saveData.endless.currentRun = clone(state.saveData.endless.currentRun || null);
    state.saveData.endless.lastRun = clone(state.saveData.endless.lastRun || null);
    return state.saveData.endless;
  }

  function ensureRiftDefenseState(targetSaveData) {
    const saveData = targetSaveData || state.saveData;

    if (!saveData) {
      return {
        bestWave: 0,
        bestGrade: null,
        clears: 0,
        highestObjectiveHp: 0,
        lastReachedWave: 0,
        lastGrade: null
      };
    }

    saveData.riftDefense = saveData.riftDefense || {
      bestWave: 0,
      bestGrade: null,
      clears: 0,
      highestObjectiveHp: 0,
      lastReachedWave: 0,
      lastGrade: null
    };
    saveData.riftDefense.bestWave = Math.max(0, Number(saveData.riftDefense.bestWave || 0));
    saveData.riftDefense.clears = Math.max(0, Number(saveData.riftDefense.clears || 0));
    saveData.riftDefense.highestObjectiveHp = Math.max(0, Number(saveData.riftDefense.highestObjectiveHp || 0));
    saveData.riftDefense.lastReachedWave = Math.max(0, Number(saveData.riftDefense.lastReachedWave || 0));
    saveData.riftDefense.bestGrade = saveData.riftDefense.bestGrade || null;
    saveData.riftDefense.lastGrade = saveData.riftDefense.lastGrade || null;
    return saveData.riftDefense;
  }

  function isRiftDefenseStage(stageDefinition) {
    return !!stageDefinition && (
      stageDefinition.id === RIFT_DEFENSE_STAGE_ID
      || stageDefinition.contentMode === "rift-defense"
    );
  }

  function isRiftDefenseBattle(battle) {
    return !!battle && (
      battle.stageId === RIFT_DEFENSE_STAGE_ID
      || battle.contentMode === "rift-defense"
    );
  }

  function getRiftDefenseWaveDefinition(stageDefinition, waveIndex) {
    if (!isRiftDefenseStage(stageDefinition)) {
      return null;
    }

    const waves = Array.isArray(stageDefinition.waves) ? stageDefinition.waves : [];
    const index = Math.max(0, Math.min(waves.length - 1, Number(waveIndex || 1) - 1));
    return waves[index] || null;
  }

  function getRiftDefenseObjectivePosition(battle) {
    const targetBattle = battle || state.battle;
    const defenseState = targetBattle && targetBattle.defenseState;

    if (!defenseState || !defenseState.objectivePosition) {
      return null;
    }

    return {
      x: Number(defenseState.objectivePosition.x || 0),
      y: Number(defenseState.objectivePosition.y || 0)
    };
  }

  function isObjectiveTile(x, y, battleOverride) {
    const objective = getRiftDefenseObjectivePosition(battleOverride);
    return !!objective && objective.x === x && objective.y === y;
  }

  function getRiftDefenseGradeFromBattle(battle) {
    if (!isRiftDefenseBattle(battle) || !battle.defenseState) {
      return null;
    }

    const defenseState = battle.defenseState;
    const ratio = Number(defenseState.objectiveMaxHp || 0) > 0
      ? Number(defenseState.objectiveHp || 0) / Number(defenseState.objectiveMaxHp || 1)
      : 0;
    const allAlliesAlive = battle.units
      .filter((unit) => unit.team === "ally")
      .every((unit) => unit.alive);

    if (battle.status === "victory") {
      if (ratio >= 0.7 && allAlliesAlive) {
        return "S";
      }

      if (ratio >= 0.4) {
        return "A";
      }

      return "B";
    }

    return Number(defenseState.waveIndex || 1) >= 3 ? "C" : null;
  }

  function compareDefenseGrades(left, right) {
    const leftIndex = left ? RIFT_DEFENSE_GRADE_ORDER.indexOf(left) : Number.POSITIVE_INFINITY;
    const rightIndex = right ? RIFT_DEFENSE_GRADE_ORDER.indexOf(right) : Number.POSITIVE_INFINITY;
    return leftIndex - rightIndex;
  }

  function buildRiftDefenseStageDefinition() {
    const progress = ensureRiftDefenseState();
    const totalBaseGold = RIFT_DEFENSE_WAVES.reduce(
      (sum, wave) => sum + Number(wave.reward && wave.reward.gold || 0),
      0
    );

    return {
      id: RIFT_DEFENSE_STAGE_ID,
      name: RIFT_DEFENSE_STAGE_META.name,
      category: "main",
      contentMode: "rift-defense",
      objective: "마지막 웨이브까지 거점을 방어",
      mapTiles: RIFT_DEFENSE_MAP_TILES,
      allySpawns: ALLY_SPAWNS,
      enemySpawns: RIFT_DEFENSE_ENEMY_SPAWNS,
      rewardGold: totalBaseGold + 70,
      introLines: [
        "리아: 균열이 열린다. 거점 앞 전열을 유지해.",
        "도윤: 증원은 파도처럼 밀려온다. 라인이 열리면 거점이 먼저 무너진다."
      ],
      cutsceneTitle: "균열 봉쇄 브리핑",
      victoryCondition: "defense_hold",
      defeatCondition: "objective_or_all_allies_down",
      mapMarkers: [
        { x: ALLY_SPAWNS[0].x, y: ALLY_SPAWNS[0].y, type: "entry", label: "진입" },
        { x: RIFT_DEFENSE_OBJECTIVE.x, y: RIFT_DEFENSE_OBJECTIVE.y, type: "defense", label: RIFT_DEFENSE_OBJECTIVE.label }
      ],
      waves: clone(RIFT_DEFENSE_WAVES),
      defenseObjective: clone(RIFT_DEFENSE_OBJECTIVE),
      description: "짧고 밀도 높은 웨이브 방어전. 위치 선정과 거점 유지가 핵심이다.",
      focusLines: [
        `현재 단계: 일반 봉쇄`,
        `최고 도달 웨이브: ${progress.bestWave > 0 ? `${progress.bestWave} / ${RIFT_DEFENSE_WAVES.length}` : "기록 없음"}`,
        `최고 방어 등급: ${progress.bestGrade || "기록 없음"}`,
        "추천 편성: 전열 2, 힐러 1, 광역 또는 관통 화력 1"
      ]
    };
  }

  function buildEndlessRunState() {
    const endless = ensureEndlessState();
    return {
      startedAt: new Date().toISOString(),
      floorStart: endless.currentFloor,
      highestFloor: endless.currentFloor,
      floorsCleared: 0,
      battlesWon: 0,
      enemiesDefeated: 0,
      eliteDefeated: 0,
      bossesDefeated: 0,
      relicsCollected: 0,
      goldEarned: 0,
      itemsLooted: 0,
      purchases: 0,
      damageDealt: 0,
      damageTaken: 0,
      chainState: null
    };
  }

  function ensureEndlessRunState() {
    const endless = ensureEndlessState();
    endless.currentRun = endless.currentRun || buildEndlessRunState();
    return endless.currentRun;
  }

  function beginEndlessRunIfNeeded() {
    const endless = ensureEndlessState();
    const currentRun = endless.currentRun;

    if (!currentRun || endless.currentFloor <= 1) {
      endless.currentRun = buildEndlessRunState();
      return endless.currentRun;
    }

    currentRun.highestFloor = Math.max(currentRun.highestFloor || endless.currentFloor, endless.currentFloor);
    return currentRun;
  }

  function getCurrentEndlessChainState() {
    const endless = state.saveData && state.saveData.endless ? state.saveData.endless : null;
    const currentRun = endless && endless.currentRun ? endless.currentRun : null;
    return currentRun && currentRun.chainState ? clone(currentRun.chainState) : null;
  }

  function getAvailableRelicChoicesForEvent(floor, random) {
    const ownedRelicIds = state.saveData && state.saveData.endless && state.saveData.endless.relicIds
      ? state.saveData.endless.relicIds
      : [];

    return buildRelicChoices(floor, random).filter((choice) => !ownedRelicIds.includes(choice.id));
  }

  function buildEventChainStarterChoices() {
    return Object.values(ENDLESS_EVENT_CHAINS).map((chain) => ({
      id: chain.starter.id,
      title: chain.starter.title,
      description: chain.starter.description,
      eventKind: "chain_start",
      chainId: chain.id
    }));
  }

  function buildEventChainResolutionChoice(chainState, floor, random) {
    if (!chainState) {
      return null;
    }

    const chain = ENDLESS_EVENT_CHAINS[chainState.id];

    if (!chain) {
      return null;
    }

    const choice = {
      id: chain.followUp.id,
      title: `${chain.followUp.title}`,
      description: chain.followUp.description,
      eventKind: "chain_resolve",
      chainId: chain.id
    };

    if (chain.id === "altar_echo") {
      const relicChoice = getAvailableRelicChoicesForEvent(floor + 7, random)[0];

      if (relicChoice) {
        choice.relicId = relicChoice.id;
        choice.relicTitle = relicChoice.title;
        choice.description = `${chain.followUp.description} ${relicChoice.title}을(를) 얻을 수 있다.`;
      } else {
        choice.description = `${chain.followUp.description} 대신 출전 파티 전원의 스탯 포인트가 크게 오른다.`;
      }
    }

    return choice;
  }

  function updateEndlessRunStat(updater) {
    if (!state.battle || state.battle.stageId !== ENDLESS_STAGE_ID || typeof updater !== "function") {
      return;
    }

    const currentRun = ensureEndlessRunState();
    updater(currentRun);
    currentRun.highestFloor = Math.max(currentRun.highestFloor || state.battle.endlessFloor || 1, state.battle.endlessFloor || 1);
  }

  function createSeededRandom(seed) {
    let value = seed % 2147483647;

    if (value <= 0) {
      value += 2147483646;
    }

    return function nextRandom() {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }

  function shuffleWithRandom(list, random) {
    const items = list.slice();

    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const temp = items[index];
      items[index] = items[swapIndex];
      items[swapIndex] = temp;
    }

    return items;
  }

  function getEndlessRelicList() {
    return Object.keys(ENDLESS_RELICS).map((relicId) => ENDLESS_RELICS[relicId]);
  }

  function buildRelicChoices(floor, random) {
    return shuffleWithRandom(getEndlessRelicList(), random)
      .slice(0, 3)
      .map((relic) => ({
        id: relic.id,
        title: relic.name,
        description: relic.description
      }));
  }

  function buildEventChoices(floor, random) {
    const normalizedFloor = Math.max(1, floor || 1);
    const activeChain = getCurrentEndlessChainState();
    const relicChoices = buildRelicChoices(normalizedFloor, random);
    const goldReward = 80 + normalizedFloor * 12;
    const trainingExp = 18 + normalizedFloor * 2;
    const repairAmount = 8 + Math.floor(normalizedFloor / 3);
    const blackMarketCost = 110 + normalizedFloor * 10;
    const eventPool = [
      {
        id: "salvage_cache",
        title: "잔해 수색",
        description: `${goldReward}G를 획득한다.`,
        goldReward
      },
      {
        id: "training_notes",
        title: "전술 기록 확보",
        description: "출전 파티 전원의 스탯 포인트 +1",
        statPointAmount: 1
      },
      {
        id: "battle_drill",
        title: "균열 전투 기록",
        description: `출전 파티 전원이 EXP ${trainingExp}를 획득한다.`,
        expReward: trainingExp
      },
      {
        id: "weapon_maintenance",
        title: "이동식 정비소",
        description: `출전 파티 장착 무기의 내구를 ${repairAmount} 회복한다.`,
        repairAmount
      },
      {
        id: "supply_crate",
        title: "보급 상자",
        description: "회복 물약 2개와 고급 물약 1개를 확보한다."
      },
      {
        id: "rift_spoils",
        title: "심연 전리품",
        description: `현재 층 기준의 랜덤 장비 1개를 획득한다.`,
        lootLevel: normalizedFloor + 1
      },
      {
        id: "memory_archive",
        title: "기억 재편 서고",
        description: "기억 재편 두루마리 1개와 스킬 포인트 +1을 확보한다.",
        fixedItemIds: ["shop-stat-reset-scroll"],
        skillPointAmount: 1
      },
      {
        id: "rift_dojo",
        title: "균열 연무장",
        description: `출전 파티 전원의 훈련 레벨 +1, EXP ${Math.floor(trainingExp / 2)} 획득.`,
        trainingLevelAmount: 1,
        expReward: Math.floor(trainingExp / 2)
      },
      {
        id: "star_chart_table",
        title: "별흔 항도",
        description: "출전 파티 전원의 잠재 점수 +3과 DEX+1 영구 상승.",
        potentialScoreAmount: 3,
        primaryStatGains: { dex: 1 }
      },
      {
        id: "oath_furnace",
        title: "맹세의 화로",
        description: `${90 + normalizedFloor * 8}G를 바치고 출전 파티 전원의 STR+1, VIT+1 영구 상승을 얻는다.`,
        goldCost: 90 + normalizedFloor * 8,
        primaryStatGains: { str: 1, vit: 1 }
      }
    ];

    if (!activeChain && normalizedFloor >= 2) {
      eventPool.push.apply(eventPool, buildEventChainStarterChoices());
    }

    if (relicChoices.length) {
      eventPool.push({
        id: "relic_echo",
        title: "유물 공명",
        description: `${relicChoices[0].title}의 힘을 즉시 흡수한다.`,
        relicId: relicChoices[0].id,
        relicTitle: relicChoices[0].title
      });
    }

    if (normalizedFloor >= 3) {
      eventPool.push({
        id: "black_market",
        title: "균열 암시장",
        description: `${blackMarketCost}G를 지불하고 수호 부적과 고급 물약을 얻는다.`,
        price: blackMarketCost
      });
    }

    const choices = shuffleWithRandom(eventPool, random).slice(0, 3);
    const chainResolution = buildEventChainResolutionChoice(activeChain, normalizedFloor, random);

    if (chainResolution) {
      return [chainResolution].concat(choices.slice(0, 2));
    }

    return choices;
  }

  function buildShopChoices(floor, random) {
    return shuffleWithRandom(
      InventoryService.SHOP_CATALOG.filter((product) => InventoryService.isAvailableInShop(product)),
      random
    )
      .slice(0, 4)
      .map((product) => ({
        id: product.id,
        title: product.name,
        description: product.description,
        price: product.price,
        rarity: product.rarity
      }));
  }

  function chooseEndlessSpecialRule(floorType, floor, random) {
    if ((floorType !== "combat" && floorType !== "boss") || floor < 3) {
      return null;
    }

    const rulePool = shuffleWithRandom(ENDLESS_SPECIAL_RULES, random);
    const baseRule = clone(rulePool[floor % rulePool.length]);

    if (floor >= 12) {
      if (typeof baseRule.effect.attackPowerBonus === "number") {
        baseRule.effect.attackPowerBonus += 1;
      }

      if (typeof baseRule.effect.defenseBonus === "number") {
        baseRule.effect.defenseBonus += 1;
      }

      if (typeof baseRule.effect.hitBonus === "number") {
        baseRule.effect.hitBonus += 4;
      }

      if (typeof baseRule.effect.avoidBonus === "number") {
        baseRule.effect.avoidBonus += 4;
      }

      baseRule.description = `${baseRule.description} 심층 균열이라 효과가 더 강하다.`;
    }

    return baseRule;
  }

  function createFilledTileMap(width, height, tileType) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => tileType));
  }

  function setMapTile(mapTiles, x, y, tileType) {
    if (mapTiles[y] && typeof mapTiles[y][x] !== "undefined") {
      mapTiles[y][x] = tileType;
    }
  }

  function carveRoom(mapTiles, room, tileType) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) {
        setMapTile(mapTiles, x, y, tileType);
      }
    }
  }

  function carveHorizontalHall(mapTiles, x1, x2, y) {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);

    for (let x = start; x <= end; x += 1) {
      setMapTile(mapTiles, x, y, "plain");
    }
  }

  function carveVerticalHall(mapTiles, y1, y2, x) {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);

    for (let y = start; y <= end; y += 1) {
      setMapTile(mapTiles, x, y, "plain");
    }
  }

  function carveHorizontalHallBand(mapTiles, x1, x2, y, thickness) {
    const radius = Math.max(0, Math.floor((Math.max(1, thickness || 1) - 1) / 2));

    for (let offset = -radius; offset <= radius; offset += 1) {
      carveHorizontalHall(mapTiles, x1, x2, y + offset);
    }

    if (Math.max(1, thickness || 1) % 2 === 0) {
      carveHorizontalHall(mapTiles, x1, x2, y + radius + 1);
    }
  }

  function carveVerticalHallBand(mapTiles, y1, y2, x, thickness) {
    const radius = Math.max(0, Math.floor((Math.max(1, thickness || 1) - 1) / 2));

    for (let offset = -radius; offset <= radius; offset += 1) {
      carveVerticalHall(mapTiles, y1, y2, x + offset);
    }

    if (Math.max(1, thickness || 1) % 2 === 0) {
      carveVerticalHall(mapTiles, y1, y2, x + radius + 1);
    }
  }

  function carveConnectorHall(mapTiles, start, end, thickness, random) {
    if (random() > 0.5) {
      carveHorizontalHallBand(mapTiles, start.x, end.x, start.y, thickness);
      carveVerticalHallBand(mapTiles, start.y, end.y, end.x, thickness);
    } else {
      carveVerticalHallBand(mapTiles, start.y, end.y, start.x, thickness);
      carveHorizontalHallBand(mapTiles, start.x, end.x, end.y, thickness);
    }
  }

  function carveCrossroads(mapTiles, center, radius) {
    const effectiveRadius = Math.max(0, Number(radius || 0));

    for (let y = center.y - effectiveRadius; y <= center.y + effectiveRadius; y += 1) {
      for (let x = center.x - effectiveRadius; x <= center.x + effectiveRadius; x += 1) {
        setMapTile(mapTiles, x, y, "plain");
      }
    }
  }

  function getRoomCenter(room) {
    return {
      x: room.x + Math.floor(room.w / 2),
      y: room.y + Math.floor(room.h / 2)
    };
  }

  function collectPassableTiles(mapTiles, excludedKeys) {
    const result = [];

    for (let y = 0; y < mapTiles.length; y += 1) {
      for (let x = 0; x < mapTiles[y].length; x += 1) {
        if (mapTiles[y][x] !== "wall" && !excludedKeys.has(`${x},${y}`)) {
          result.push({ x, y });
        }
      }
    }

    return result;
  }

  function collectWallBreachCandidates(mapTiles, excludedKeys) {
    const result = [];

    for (let y = 1; y < mapTiles.length - 1; y += 1) {
      for (let x = 1; x < mapTiles[y].length - 1; x += 1) {
        if (mapTiles[y][x] !== "wall" || excludedKeys.has(`${x},${y}`)) {
          continue;
        }

        const openNeighbors = [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 }
        ].filter((position) => mapTiles[position.y] && mapTiles[position.y][position.x] !== "wall").length;

        if (openNeighbors >= 2) {
          result.push({ x, y });
        }
      }
    }

    return result;
  }

  function buildEndlessContactMarkers(floorType, floor, mapTiles, existingMarkers, random) {
    if ((floorType !== "combat" && floorType !== "boss") || floor < 2) {
      return [];
    }

    const markerKeys = new Set((existingMarkers || []).map((marker) => `${marker.x},${marker.y}`));
    const protectedKeys = new Set(
      ALLY_SPAWNS
        .concat(ENEMY_SPAWN_CANDIDATES)
        .concat((existingMarkers || []).map((marker) => ({ x: marker.x, y: marker.y })))
        .map((position) => `${position.x},${position.y}`)
    );
    const encounterPool = floorType === "boss"
      ? ["sealed_anvil", "whisper_shrine", "buried_cache"]
      : Object.keys(ENDLESS_CONTACT_EVENTS);
    const passableTiles = shuffleWithRandom(collectPassableTiles(mapTiles, protectedKeys), random)
      .filter((tile) => tile.x >= 3 && tile.x <= 10 && tile.y >= 1 && tile.y <= 6 && !markerKeys.has(`${tile.x},${tile.y}`));
    const markerCount = floorType === "boss" ? 1 : (floor >= 8 && random() > 0.55 ? 2 : 1);
    const markers = [];

    for (let index = 0; index < markerCount; index += 1) {
      const tile = passableTiles[index];
      const encounterId = encounterPool[Math.floor(random() * encounterPool.length)];
      const encounter = ENDLESS_CONTACT_EVENTS[encounterId];

      if (!tile || !encounter) {
        continue;
      }

      markers.push({
        id: `contact-${encounterId}-${floor}-${index}`,
        x: tile.x,
        y: tile.y,
        type: encounter.markerType,
        label: encounter.markerLabel,
        encounterId
      });
    }

    return markers;
  }

  function buildEndlessDungeonLayout(floorType, floor, random) {
    const width = MAP_WIDTH;
    const height = MAP_HEIGHT;
    const mapTiles = createFilledTileMap(width, height, "wall");
    const entranceRoom = { x: 0, y: 4, w: 4, h: 3 };
    const bossRoom = { x: 8, y: 0, w: 4, h: 3 };
    const middleTemplates = [
      { x: 4, y: 2, w: 4, h: 3 },
      { x: 3, y: 2, w: 5, h: 3 },
      { x: 5, y: 2, w: 4, h: 3 },
      { x: 4, y: 3, w: 4, h: 3 }
    ];
    const topFlankTemplates = [
      { x: 2, y: 0, w: 3, h: 2 },
      { x: 4, y: 0, w: 4, h: 2 },
      { x: 6, y: 1, w: 3, h: 2 }
    ];
    const bottomFlankTemplates = [
      { x: 4, y: 5, w: 4, h: 2 },
      { x: 6, y: 5, w: 3, h: 2 },
      { x: 8, y: 4, w: 3, h: 2 }
    ];
    const middleRoom = clone(middleTemplates[Math.floor(random() * middleTemplates.length)]);
    const topFlankRoom = clone(topFlankTemplates[Math.floor(random() * topFlankTemplates.length)]);
    const bottomFlankRoom = clone(bottomFlankTemplates[Math.floor(random() * bottomFlankTemplates.length)]);
    const useTopFlank = floorType === "combat" || floorType === "boss" || floor % 2 === 0;
    const useBottomFlank = floorType === "combat" || floorType === "boss" || floor >= 4;
    const mainHallThickness = floorType === "combat" || floorType === "boss" ? 2 : 1;
    const rooms = [entranceRoom, middleRoom, bossRoom];

    rooms.forEach((room) => carveRoom(mapTiles, room, "plain"));

    if (useTopFlank) {
      carveRoom(mapTiles, topFlankRoom, "plain");
    }

    if (useBottomFlank) {
      carveRoom(mapTiles, bottomFlankRoom, "plain");
    }

    for (let index = 0; index < rooms.length - 1; index += 1) {
      const start = getRoomCenter(rooms[index]);
      const end = getRoomCenter(rooms[index + 1]);
      carveConnectorHall(mapTiles, start, end, mainHallThickness, random);
    }

    const middleCenter = getRoomCenter(middleRoom);
    carveCrossroads(mapTiles, middleCenter, floorType === "combat" || floorType === "boss" ? 1 : 0);
    carveHorizontalHallBand(
      mapTiles,
      getRoomCenter(entranceRoom).x,
      getRoomCenter(bossRoom).x,
      middleCenter.y,
      floorType === "combat" || floorType === "boss" ? 2 : 1
    );

    if (useTopFlank) {
      carveConnectorHall(mapTiles, getRoomCenter(topFlankRoom), middleCenter, 1, random);
    }

    if (useBottomFlank) {
      carveConnectorHall(mapTiles, getRoomCenter(bottomFlankRoom), middleCenter, 1, random);
    }

    const protectedTiles = new Set(
      ALLY_SPAWNS.concat(ENDLESS_ENEMY_SPAWN_CANDIDATES).map((position) => `${position.x},${position.y}`)
    );
    const wallBreakCandidates = shuffleWithRandom(collectWallBreachCandidates(mapTiles, protectedTiles), random);
    const breachCount = floorType === "combat" || floorType === "boss"
      ? Math.min(14, 6 + Math.floor(floor / 2))
      : Math.min(7, 3 + Math.floor(floor / 5));

    wallBreakCandidates.slice(0, breachCount).forEach((tile, index) => {
      setMapTile(mapTiles, tile.x, tile.y, index % 3 === 0 ? "ruin" : "plain");
    });

    const terrainCandidates = shuffleWithRandom(collectPassableTiles(mapTiles, protectedTiles), random);
    const forestCount = floorType === "combat" || floorType === "boss"
      ? Math.min(8, 3 + Math.floor(floor / 3))
      : Math.min(4, 1 + Math.floor(floor / 6));
    const hillCount = floorType === "combat" || floorType === "boss"
      ? Math.min(5, 2 + Math.floor(floor / 6))
      : 1;
    const marshCount = floorType === "combat"
      ? Math.min(4, 1 + Math.floor(floor / 4))
      : floorType === "boss"
        ? Math.min(3, 1 + Math.floor(floor / 6))
        : Math.min(2, 1 + Math.floor(floor / 8));
    const ruinCount = floorType === "combat" || floorType === "boss"
      ? Math.min(7, 2 + Math.floor(floor / 3))
      : Math.min(3, 1 + Math.floor(floor / 7));

    terrainCandidates.slice(0, forestCount).forEach((tile) => {
      setMapTile(mapTiles, tile.x, tile.y, "forest");
    });

    terrainCandidates.slice(forestCount, forestCount + hillCount).forEach((tile) => {
      setMapTile(mapTiles, tile.x, tile.y, "hill");
    });

    terrainCandidates.slice(forestCount + hillCount, forestCount + hillCount + marshCount).forEach((tile) => {
      setMapTile(mapTiles, tile.x, tile.y, "marsh");
    });

    terrainCandidates.slice(
      forestCount + hillCount + marshCount,
      forestCount + hillCount + marshCount + ruinCount
    ).forEach((tile) => {
      setMapTile(mapTiles, tile.x, tile.y, "ruin");
    });

    ALLY_SPAWNS.concat(ENDLESS_ENEMY_SPAWN_CANDIDATES).forEach((position) => {
      setMapTile(mapTiles, position.x, position.y, "plain");
    });

    const mapElevations = mapTiles.map((row) => row.map((tileType) => {
      if (tileType === "wall") {
        return 2;
      }

      if (tileType === "hill") {
        return 1;
      }

      if (tileType === "ruin") {
        return 1;
      }

      return 0;
    }));

    const entranceCenter = getRoomCenter(entranceRoom);
    const goalCenter = getRoomCenter(bossRoom);
    const markerByFloorType = {
      combat: { type: "exit", label: "출구" },
      boss: { type: "boss", label: "보스실" },
      rest: { type: "rest", label: "휴식실" },
      supply: { type: "supply", label: "보급실" },
      shop: { type: "shop", label: "상점" },
      relic: { type: "relic", label: "유물실" },
      event: { type: "event", label: "사건실" }
    };
    const goalMarker = markerByFloorType[floorType] || markerByFloorType.combat;
    const mapMarkers = [
      { x: entranceCenter.x, y: entranceCenter.y, type: "entry", label: "입구" },
      { x: goalCenter.x, y: goalCenter.y, type: goalMarker.type, label: goalMarker.label }
    ];

    mapMarkers.push.apply(
      mapMarkers,
      buildEndlessContactMarkers(floorType, floor, mapTiles, mapMarkers, random)
    );

    return {
      tiles: mapTiles,
      elevations: mapElevations,
      markers: mapMarkers
    };
  }

  function buildEndlessStageDefinition(floor) {
    const normalizedFloor = Math.max(1, floor || 1);
    const seed = normalizedFloor * 7919 + 17;
    const random = createSeededRandom(seed);
    const floorType = chooseEndlessFloorType(normalizedFloor, random);
    const dungeonLayout = buildEndlessDungeonLayout(floorType, normalizedFloor, random);
    const mapTiles = dungeonLayout.tiles;

    const bossEnabled = floorType === "boss";
    const bossWeaponType = ["sword", "axe", "bow", "lance"][normalizedFloor % 4];
    const bossClassNameByType = {
      sword: "검사",
      axe: "브리건드",
      bow: "헌터",
      lance: "솔저"
    };
    const bossSkillByType = {
      sword: ["warlord_presence", "boss_cleave"],
      axe: ["warlord_presence", "boss_cleave"],
      bow: ["eagle_commander", "rain_of_arrows"],
      lance: ["fortress_heart", "guard_roar"]
    };
    const specialRule = chooseEndlessSpecialRule(floorType, normalizedFloor, random);
    const activeChain = floorType === "event" ? getCurrentEndlessChainState() : null;

    return {
      id: ENDLESS_STAGE_ID,
      name: `무한 균열 ${normalizedFloor}층`,
      objective: floorType === "rest"
        ? "휴식을 마치고 다음 층으로 이동"
        : floorType === "supply"
          ? "보급을 정리하고 다음 층으로 이동"
          : floorType === "shop"
            ? "상점을 정리하고 다음 층으로 이동"
          : floorType === "relic"
            ? "유물을 선택하고 다음 층으로 이동"
            : floorType === "event"
              ? "적을 정리한 뒤 사건을 선택하고 다음 층으로 이동"
          : bossEnabled
            ? "보스 격파 또는 적 전멸"
            : "모든 적 격파",
      mapTiles,
      allySpawns: ALLY_SPAWNS,
      enemySpawns: floorType === "rest" || floorType === "supply" ? [] : shuffleWithRandom(ENDLESS_ENEMY_SPAWN_CANDIDATES, random),
      enemyBonus: Math.min(8, normalizedFloor <= 4 ? Math.floor((normalizedFloor - 1) / 2) : Math.floor(normalizedFloor / 2)),
      rewardGold: floorType === "rest"
        ? 70 + normalizedFloor * 12
        : floorType === "supply"
          ? 90 + normalizedFloor * 16
          : floorType === "shop"
            ? 70 + normalizedFloor * 14
          : floorType === "relic" || floorType === "event"
            ? 60 + normalizedFloor * 10
          : 120 + normalizedFloor * 35,
      introLines: [
        `리아: 균열 ${normalizedFloor}층이다. 방과 통로 구조부터 빠르게 파악해.`,
        floorType === "rest"
          ? "도윤: 잠시 숨을 돌릴 수 있겠어. 휴식실에서 전열을 다시 정비하자."
          : floorType === "supply"
            ? "세라: 보급 창고 흔적이 보여. 통로를 따라 챙길 수 있는 건 모두 챙기자."
            : floorType === "shop"
              ? "도윤: 상점방이다. 다음 전투 전에 필요한 것만 고르자."
            : floorType === "relic"
              ? "리아: 유물실이야. 하나를 고르면 다음 방부터 흐름이 달라질 거야."
              : floorType === "event"
                ? "도윤: 사건방이다. 하나를 고르면 다른 가능성은 닫힌다."
              : bossEnabled
                ? "도윤: 가장 안쪽 방에 강한 반응이 있다. 통로를 열며 밀고 들어가자."
                : "세라: 적 반응이 방마다 흩어져 있어. 시야를 넓히며 전진하자."
      ].concat(
        activeChain
          ? [`연속 사건 - ${activeChain.name}: 이전 층에서 붙잡은 실마리가 다시 모습을 드러냈다.`]
          : []
      ).concat(
        specialRule
          ? [`전장 규칙 - ${specialRule.name}: ${specialRule.description}`]
          : []
      ),
      boss: bossEnabled ? {
        id: `endless-boss-${normalizedFloor}`,
        name: `균열 수호자 ${normalizedFloor}`,
        title: "무한 균열 지배체",
        className: bossClassNameByType[bossWeaponType],
        weaponType: bossWeaponType,
        spawn: { x: 11, y: 1 },
        levelBonus: 2 + Math.floor(normalizedFloor / 2),
        maxHpBonus: 5 + normalizedFloor,
        statBonuses: {
          str: 2 + Math.floor(normalizedFloor / 3),
          skl: 1 + Math.floor(normalizedFloor / 4),
          spd: 1 + Math.floor(normalizedFloor / 4),
          def: 2 + Math.floor(normalizedFloor / 3)
        },
        movBonus: normalizedFloor >= 5 ? 1 : 0,
        specialSkillIds: [bossSkillByType[bossWeaponType][0]],
        specialActiveSkillIds: [bossSkillByType[bossWeaponType][1]]
      } : null,
      victoryCondition: floorType === "rest" || floorType === "supply" || floorType === "shop"
        || floorType === "relic"
        ? "support_complete"
        : bossEnabled
          ? "boss_or_route"
          : "route_enemy",
      cutsceneTitle: `무한 균열 ${normalizedFloor}층`,
      events: bossEnabled ? [
        {
          id: `endless-${normalizedFloor}-boss-half`,
          trigger: "boss_hp_half",
          lines: [
            "리아: 균열 핵이 흔들리고 있어. 지금 밀어붙이면 끝낼 수 있어."
          ]
        }
      ] : [],
      endlessFloor: normalizedFloor,
      floorType,
      specialRule,
      mapElevations: dungeonLayout.elevations,
      mapMarkers: dungeonLayout.markers,
      pendingChoice: floorType === "relic"
        ? {
            type: "relic",
            title: "균열 유물 선택",
            choices: buildRelicChoices(normalizedFloor, random)
          }
        : floorType === "shop"
          ? {
              type: "shop",
              title: "균열 상점",
              choices: buildShopChoices(normalizedFloor, random)
            }
          : null,
      deferredChoice: floorType === "event"
          ? {
              type: "event",
              title: activeChain ? `연속 사건: ${activeChain.name}` : "균열 사건 선택",
              choices: buildEventChoices(normalizedFloor, random)
            }
          : null
    };
  }

  function chooseEndlessFloorType(floor, random) {
    const normalizedFloor = Math.max(1, floor || 1);

    if (normalizedFloor % 10 === 0) {
      return "boss";
    }

    const candidates = [
      { type: "combat", weight: normalizedFloor <= 2 ? 60 : 42 },
      { type: "event", weight: normalizedFloor <= 2 ? 18 : 14 },
      { type: "rest", weight: normalizedFloor <= 2 ? 14 : 12 },
      { type: "supply", weight: normalizedFloor <= 2 ? 8 : 12 }
    ];

    if (normalizedFloor >= 3) {
      candidates.push({ type: "relic", weight: 12 });
    }

    if (normalizedFloor >= 5) {
      candidates.push({ type: "shop", weight: 8 });
    }

    const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = random() * totalWeight;

    for (let i = 0; i < candidates.length; i += 1) {
      roll -= candidates[i].weight;

      if (roll < 0) {
        return candidates[i].type;
      }
    }

    return candidates[0].type;
  }

  function getCurrentStageDefinition() {
    const selectedStageId = state.saveData && state.saveData.stageId;

    if (selectedStageId === ENDLESS_STAGE_ID) {
      return buildEndlessStageDefinition(ensureEndlessState().currentFloor);
    }

    if (selectedStageId === RIFT_DEFENSE_STAGE_ID) {
      return buildRiftDefenseStageDefinition();
    }

    if (selectedStageId) {
      return getStageDefinitionById(selectedStageId);
    }

    const campaign = ensureCampaignState();
    const stageIndex = Math.max(0, Math.min(STAGE_DEFINITIONS.length - 1, campaign.currentStageIndex || 0));
    return STAGE_DEFINITIONS[stageIndex];
  }

  function getStageDefinitionById(stageId) {
    if (stageId === ENDLESS_STAGE_ID) {
      return buildEndlessStageDefinition(ensureEndlessState().currentFloor);
    }

    if (stageId === RIFT_DEFENSE_STAGE_ID) {
      return buildRiftDefenseStageDefinition();
    }

    return STAGE_DEFINITIONS.find((stage) => stage.id === stageId) || STAGE_DEFINITIONS[0];
  }

  function resolveWeaponForUnit(unit) {
    if (!unit.weapon) {
      return null;
    }

    const item = getPersistentItem(typeof unit.weapon === "string" ? unit.weapon : unit.weapon.id);
    return item ? clone(item) : null;
  }

  function syncBattleUnitEquipmentState(unitId) {
    const battleUnit = getUnitById(unitId);
    const persistentUnit = getPersistentUnit(unitId);

    if (!battleUnit || !persistentUnit) {
      return;
    }

    SkillsService.normalizeUnitLearnedSkills(persistentUnit);
    const previousHp = battleUnit.hp;
    const previousMaxHp = battleUnit.maxHp;
    const effectiveUnit = InventoryService.getEffectiveUnitStats(state.saveData, persistentUnit);

    battleUnit.primaryStats = clone(effectiveUnit.primaryStats || persistentUnit.primaryStats || {});
    battleUnit.hiddenStats = clone(effectiveUnit.hiddenStats || persistentUnit.hiddenStats || {});
    battleUnit.statPoints = persistentUnit.statPoints || 0;
    battleUnit.skillPoints = persistentUnit.skillPoints || 0;
    battleUnit.potentialScore = persistentUnit.potentialScore || 0;
    battleUnit.trainingLevel = persistentUnit.trainingLevel || 0;
    battleUnit.trainingAttempts = persistentUnit.trainingAttempts || 0;
    battleUnit.spentPrimaryStats = clone(persistentUnit.spentPrimaryStats || {});
    battleUnit.specialSkillIds = clone(persistentUnit.specialSkillIds || []);
    battleUnit.specialActiveSkillIds = clone(persistentUnit.specialActiveSkillIds || []);
    battleUnit.learnedSkillIds = clone(persistentUnit.learnedSkillIds || []);
    battleUnit.learnedActiveSkillIds = clone(persistentUnit.learnedActiveSkillIds || []);
    battleUnit.equippedActiveSkillIds = clone(persistentUnit.equippedActiveSkillIds || []);
    battleUnit.skillLevels = clone(persistentUnit.skillLevels || {});
    battleUnit.grantedMilestoneSkillLevels = clone(persistentUnit.grantedMilestoneSkillLevels || []);
    battleUnit.maxHp = effectiveUnit.maxHp;
    battleUnit.str = effectiveUnit.str;
    battleUnit.skl = effectiveUnit.skl;
    battleUnit.spd = effectiveUnit.spd;
    battleUnit.def = effectiveUnit.def;
    battleUnit.mov = effectiveUnit.mov;
    battleUnit.weapon = resolveWeaponForUnit(persistentUnit);
    battleUnit.equippedItemIds = clone(persistentUnit.equippedItemIds || []);
    SkillsService.normalizeUnitLearnedSkills(battleUnit);

    if (!previousMaxHp || previousHp >= previousMaxHp) {
      battleUnit.hp = battleUnit.maxHp;
      return;
    }

    battleUnit.hp = Math.max(1, Math.min(battleUnit.maxHp, Math.round((previousHp / previousMaxHp) * battleUnit.maxHp)));
  }

  function initializeUnitBattleState(unit) {
    unit.statusEffects = clone(unit.statusEffects || []);
    unit.skillCooldowns = clone(unit.skillCooldowns || {});
    unit.turnMoveCommit = clone(unit.turnMoveCommit || null);
    return unit;
  }

  function createBattlefieldEffect(rule) {
    return Object.assign({}, clone(rule.effect), {
      id: `${rule.effect.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      battlefieldRuleId: rule.id,
      source: "battlefield"
    });
  }

  function createEliteTraitEffect(trait) {
    return Object.assign({}, clone(trait.effect), {
      id: `${trait.effect.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      source: "elite-trait"
    });
  }

  function applyBattlefieldRuleEffects(stageDefinition, battle) {
    if (!stageDefinition || !stageDefinition.specialRule || !battle) {
      return;
    }

    const rule = stageDefinition.specialRule;
    battle.specialRule = clone(rule);
    battle.units.forEach((unit) => {
      const shouldApply = rule.targetTeam === "all"
        || (rule.targetTeam === "ally" && unit.team === "ally")
        || (rule.targetTeam === "enemy" && unit.team === "enemy");

      if (!shouldApply) {
        return;
      }

      unit.statusEffects = unit.statusEffects || [];
      unit.statusEffects.push(createBattlefieldEffect(rule));
    });

    battle.logs.push(`전장 규칙 발현: ${rule.name} - ${rule.description}`);
    battle.lastEventText = `${rule.name}이 전장 전체를 뒤덮었다.`;
  }

  function isSupportFloorType(floorType) {
    return floorType === "rest" || floorType === "supply" || floorType === "shop" || floorType === "relic";
  }

  function applySupportFloorBenefits(stageDefinition, battle) {
    if (!stageDefinition || !isSupportFloorType(stageDefinition.floorType)) {
      return;
    }

    if (stageDefinition.floorType === "rest") {
      getSelectedPartyUnits().forEach((unit) => {
        unit.statPoints = (unit.statPoints || 0) + 1;
      });

      const potion = InventoryService.buildShopItem("shop-potion");
      InventoryService.addItemToInventory(state.saveData, potion);
      battle.logs.push("휴식층 효과: 출전 파티 전원의 스탯 포인트 +1");
      battle.logs.push(`휴식층 보급: ${potion.name} 확보`);
      battle.lastEventText = "휴식층에서 전열을 재정비했다.";
      return;
    }

    if (stageDefinition.floorType === "supply") {
      const supportGold = 90 + stageDefinition.endlessFloor * 10;
      const hiPotion = InventoryService.buildShopItem("shop-hi-potion");
      state.saveData.partyGold += supportGold;
      InventoryService.addItemToInventory(state.saveData, hiPotion);
      battle.logs.push(`보급층 효과: 균열 잔해에서 ${supportGold}G 확보`);
      battle.logs.push(`보급층 보상: ${hiPotion.name} 확보`);
      battle.lastEventText = "보급층에서 자원을 정리했다.";
      return;
    }

    if (stageDefinition.floorType === "shop") {
      battle.logs.push("상점층 효과: 균열 상인이 잠시 모습을 드러냈다.");
      battle.lastEventText = "상점층에서 필요한 보급을 고를 수 있다.";
      return;
    }

    if (stageDefinition.floorType === "relic") {
      battle.logs.push("유물층 효과: 하나의 유물을 선택해 엔드리스 강화 효과를 획득할 수 있다.");
      battle.lastEventText = "균열 유물이 모습을 드러냈다.";
      return;
    }

  }

  function getEncounterMarkerAt(x, y) {
    return state.battle && state.battle.map && state.battle.map.markers
      ? state.battle.map.markers.find((marker) => marker.x === x && marker.y === y && marker.encounterId)
      : null;
  }

  function removeBattleMarker(markerId) {
    if (!state.battle || !state.battle.map || !markerId) {
      return;
    }

    state.battle.map.markers = (state.battle.map.markers || []).filter((marker) => marker.id !== markerId);
  }

  function triggerContactEncounter(unit, x, y) {
    if (!state.battle || state.battle.pendingChoice || !unit || unit.team !== "ally") {
      return false;
    }

    const marker = getEncounterMarkerAt(x, y);
    const encounter = marker ? ENDLESS_CONTACT_EVENTS[marker.encounterId] : null;

    if (!marker || !encounter) {
      return false;
    }

    const choiceSet = buildContactChoiceSet(marker.encounterId, state.battle.endlessFloor || 1);
    state.battle.pendingChoice = {
      type: "contact",
      title: choiceSet.title,
      description: choiceSet.description,
      choices: choiceSet.choices,
      markerId: marker.id,
      encounterId: marker.encounterId,
      unitId: unit.id
    };
    addLog(`[접촉] ${choiceSet.title}`);
    state.battle.lastEventText = `${choiceSet.title}에 접촉했다.`;
    return true;
  }

  function hydrateBattleState() {
    if (!state.battle || !state.battle.units) {
      return;
    }

    state.battle.triggeredEventIds = clone(state.battle.triggeredEventIds || []);
    state.battle.grantedRewardIds = clone(state.battle.grantedRewardIds || []);
    state.battle.lastEventText = state.battle.lastEventText || "";
    state.battle.bossUnitId = state.battle.bossUnitId || null;
    state.battle.allySpawns = clone(state.battle.allySpawns || ALLY_SPAWNS);
    state.battle.victoryCondition = state.battle.victoryCondition || "route_enemy";
    state.battle.defeatCondition = state.battle.defeatCondition || "leader_down";
    state.battle.cutsceneTitle = state.battle.cutsceneTitle || "";
    state.battle.cutsceneLines = clone(state.battle.cutsceneLines || []);
    state.battle.cutsceneSeen = typeof state.battle.cutsceneSeen === "boolean"
      ? state.battle.cutsceneSeen
      : state.battle.turnNumber > 1;
    state.battle.endlessFloor = state.battle.endlessFloor || null;
    state.battle.floorType = state.battle.floorType || "combat";
    state.battle.specialRule = clone(state.battle.specialRule || null);
    state.battle.pendingChoice = clone(state.battle.pendingChoice || null);
    state.battle.map = normalizeBattleMap(state.battle.map);
    state.battle.units.forEach((unit) => {
      initializeUnitBattleState(unit);
      SkillsService.normalizeUnitLearnedSkills(unit);
    });
  }

  function createMap(stageDefinition) {
    const fallbackMarkers = [];

    if (stageDefinition.allySpawns && stageDefinition.allySpawns[0]) {
      fallbackMarkers.push({
        x: stageDefinition.allySpawns[0].x,
        y: stageDefinition.allySpawns[0].y,
        type: "entry",
        label: "시작"
      });
    }

    if (stageDefinition.boss && stageDefinition.boss.spawn) {
      fallbackMarkers.push({
        x: stageDefinition.boss.spawn.x,
        y: stageDefinition.boss.spawn.y,
        type: "boss",
        label: "목표"
      });
    }

    return normalizeBattleMap({
      id: stageDefinition.id,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles: clone(stageDefinition.mapTiles),
      elevations: clone(stageDefinition.mapElevations || null),
      markers: clone(stageDefinition.mapMarkers || fallbackMarkers)
    });
  }

  function getEnemyArchetypeById(archetypeId) {
    return ENEMY_ARCHETYPES.find((entry) => entry.id === archetypeId) || ENEMY_ARCHETYPES[0];
  }

  function getEnemyArchetypePool(stageDefinition) {
    const poolIds = stageDefinition.id === ENDLESS_STAGE_ID
      ? ENEMY_ARCHETYPE_POOLS[ENDLESS_STAGE_ID]
      : ENEMY_ARCHETYPE_POOLS.default.concat(ENEMY_ARCHETYPE_POOLS[stageDefinition.id] || []);
    return poolIds
      .map((archetypeId) => getEnemyArchetypeById(archetypeId))
      .filter(Boolean);
  }

  function pickEnemyArchetype(stageDefinition) {
    const pool = getEnemyArchetypePool(stageDefinition);

    return pool[Math.floor(Math.random() * pool.length)] || ENEMY_ARCHETYPES[0];
  }

  function buildEnemyArchetypeSequence(stageDefinition, count) {
    const uniquePool = Array.from(new Map(
      getEnemyArchetypePool(stageDefinition).map((archetype) => [archetype.id, archetype])
    ).values());

    if (!uniquePool.length || count <= 0) {
      return [];
    }

    const sequence = [];
    let workingPool = uniquePool.slice();

    while (sequence.length < count) {
      if (!workingPool.length) {
        workingPool = uniquePool.slice();
      }

      const pickIndex = Math.floor(Math.random() * workingPool.length);
      sequence.push(workingPool[pickIndex]);
      workingPool.splice(pickIndex, 1);
    }

    return sequence;
  }

  function summarizePartyCombatProfile(units) {
    const selectedUnits = (units || []).filter(Boolean);
    const unitCount = Math.max(1, selectedUnits.length);
    const effectiveUnits = selectedUnits.map((unit) => InventoryService.getEffectiveUnitStats(state.saveData, clone(unit)));
    const primaryStats = StatsService.PRIMARY_STATS.reduce((accumulator, statName) => {
      accumulator[statName] = 0;
      return accumulator;
    }, {});
    const hiddenStats = ENDLESS_PARTY_HIDDEN_STAT_KEYS.reduce((accumulator, statName) => {
      accumulator[statName] = 0;
      return accumulator;
    }, {});
    const profile = {
      averageLevel: Math.round(
        (effectiveUnits.reduce((sum, unit) => sum + Number(unit.level || 1), 0) || unitCount) / unitCount
      ),
      primaryStats,
      hiddenStats,
      pressureByPrimary: {}
    };

    effectiveUnits.forEach((unit) => {
      const normalizedPrimary = unit.primaryStats || StatsService.derivePrimaryStatsFromLegacy(unit);
      const normalizedHidden = unit.hiddenStats || {};

      StatsService.PRIMARY_STATS.forEach((statName) => {
        profile.primaryStats[statName] += Number(normalizedPrimary[statName] || 0);
      });

      ENDLESS_PARTY_HIDDEN_STAT_KEYS.forEach((statName) => {
        profile.hiddenStats[statName] += Number(normalizedHidden[statName] || 0);
      });
    });

    StatsService.PRIMARY_STATS.forEach((statName) => {
      profile.primaryStats[statName] = Number((profile.primaryStats[statName] / unitCount).toFixed(1));
    });

    ENDLESS_PARTY_HIDDEN_STAT_KEYS.forEach((statName) => {
      profile.hiddenStats[statName] = Number((profile.hiddenStats[statName] / unitCount).toFixed(1));
    });

    profile.pressureByPrimary = {
      str: Number((
        (profile.hiddenStats.physicalAttack / 30)
        + (profile.hiddenStats.critChance / 14)
      ).toFixed(1)),
      dex: Number((
        (profile.hiddenStats.accuracy / 90)
        + (profile.hiddenStats.evasion / 120)
      ).toFixed(1)),
      vit: Number((
        (profile.hiddenStats.physicalDefense / 38)
        + (profile.hiddenStats.magicDefense / 46)
      ).toFixed(1)),
      int: Number((
        (profile.hiddenStats.magicAttack / 28)
        + (profile.hiddenStats.skillPower / 34)
        + (profile.hiddenStats.healPower / 40)
      ).toFixed(1)),
      luk: Number((
        (profile.hiddenStats.critChance / 8)
        + (profile.hiddenStats.evasion / 180)
      ).toFixed(1))
    };

    return profile;
  }

  function getEndlessEnemyPrimaryWeights(weaponType) {
    return ENDLESS_ENEMY_PRIMARY_WEIGHTS[weaponType] || ENDLESS_ENEMY_PRIMARY_WEIGHTS.sword;
  }

  function applyEndlessPartyPressure(unit, partyProfile, stageDefinition, options) {
    if (!unit || !partyProfile || stageDefinition.id !== ENDLESS_STAGE_ID) {
      return unit;
    }

    const nextOptions = options || {};
    const floor = Math.max(1, Number(stageDefinition.endlessFloor || 1));
    const level = Math.max(1, Number(unit.level || partyProfile.averageLevel || 1));
    const basePrimary = StatsService.derivePrimaryStatsFromLegacy(unit);
    const weights = getEndlessEnemyPrimaryWeights(unit.weapon ? unit.weapon.type : null);
    const floorPressure = Math.max(0, Math.floor((floor - 1) / 4));
    const bossPressure = nextOptions.isBoss ? 1.4 : nextOptions.isElite ? 0.8 : 0;
    const nextPrimary = {};

    StatsService.PRIMARY_STATS.forEach((statName) => {
      const baseValue = Number(basePrimary[statName] || 1);
      const partyValue = Number(partyProfile.primaryStats[statName] || baseValue);
      const hiddenPressure = Number(partyProfile.pressureByPrimary[statName] || 0);
      const roleWeight = Number(weights[statName] || 0.45);
      nextPrimary[statName] = Math.max(
        1,
        Math.round(
          (baseValue * 0.58)
          + (partyValue * roleWeight)
          + (hiddenPressure * (0.55 + roleWeight * 0.2))
          + (level * 0.09)
          + (floorPressure * (0.35 + roleWeight * 0.2))
          + bossPressure
        )
      );
    });

    unit.primaryStats = nextPrimary;
    StatsService.recalculateUnitStats(unit, { keepHpFull: true });
    return unit;
  }

  function buildEndlessEnemyEquipmentPackage(unit, stageDefinition, options) {
    if (!unit || !stageDefinition || stageDefinition.id !== ENDLESS_STAGE_ID) {
      return null;
    }

    const nextOptions = options || {};
    const template = ENDLESS_ENEMY_EQUIPMENT_TEMPLATES[unit.weapon ? unit.weapon.type : "sword"]
      || ENDLESS_ENEMY_EQUIPMENT_TEMPLATES.sword;
    const floor = Math.max(1, Number(stageDefinition.endlessFloor || 1));
    const level = Math.max(1, Number(unit.level || 1));
    const tier = Math.max(
      1,
      1
      + Math.floor(level / 7)
      + Math.floor(Math.max(0, floor - 1) / 5)
      + (nextOptions.isElite ? 1 : 0)
      + (nextOptions.isBoss ? 2 : 0)
    );
    const primaryBonuses = {};
    const hiddenBonuses = {};
    const weaponBonuses = {};

    Object.keys(template.primaryBonuses || {}).forEach((statName) => {
      const baseValue = Number(template.primaryBonuses[statName] || 0);
      primaryBonuses[statName] = baseValue + Math.floor((tier - 1) / 2);
    });

    Object.keys(template.hiddenBonuses || {}).forEach((statName) => {
      const baseValue = Number(template.hiddenBonuses[statName] || 0);
      hiddenBonuses[statName] = baseValue + Math.floor(tier * 1.5);
    });

    Object.keys(template.weaponBonuses || {}).forEach((statName) => {
      const baseValue = Number(template.weaponBonuses[statName] || 0);
      weaponBonuses[statName] = baseValue + Math.floor((tier - 1) / 2);
    });

    return {
      items: clone(template.items || []),
      primaryBonuses,
      hiddenBonuses,
      weaponBonuses
    };
  }

  function applyEnemyEquipmentPackage(unit, equipmentPackage) {
    if (!unit || !equipmentPackage) {
      return unit;
    }

    const nextPrimary = Object.assign(
      {},
      clone(unit.primaryStats || StatsService.derivePrimaryStatsFromLegacy(unit))
    );

    Object.keys(equipmentPackage.primaryBonuses || {}).forEach((statName) => {
      nextPrimary[statName] = Math.max(
        1,
        Number(nextPrimary[statName] || 0) + Number(equipmentPackage.primaryBonuses[statName] || 0)
      );
    });

    unit.primaryStats = nextPrimary;
    StatsService.recalculateUnitStats(unit, { keepHpFull: true });
    unit.hiddenStats = Object.assign({}, clone(unit.hiddenStats || {}));

    Object.keys(equipmentPackage.hiddenBonuses || {}).forEach((statName) => {
      unit.hiddenStats[statName] = Math.round(
        Number(unit.hiddenStats[statName] || 0) + Number(equipmentPackage.hiddenBonuses[statName] || 0)
      );
    });

    if (unit.weapon) {
      Object.keys(equipmentPackage.weaponBonuses || {}).forEach((statName) => {
        unit.weapon[statName] = Math.round(
          Number(unit.weapon[statName] || 0) + Number(equipmentPackage.weaponBonuses[statName] || 0)
        );
      });
    }

    unit.enemyEquipment = clone(equipmentPackage.items || []);
    unit.enemyEquipmentSummary = (equipmentPackage.items || []).join(", ");
    unit.hp = unit.maxHp;
    return unit;
  }

  function rollEnemyLevel(stageDefinition, averageLevel, partyProfile) {
    const floorBonus = Math.max(0, Number(stageDefinition.enemyBonus || 0));

    if (stageDefinition.id !== ENDLESS_STAGE_ID) {
      const stageAnchor = Math.max(1, averageLevel, 2 + floorBonus);
      return Math.max(1, stageAnchor + Math.floor(Math.random() * 2));
    }

    const floor = Math.max(1, Number(stageDefinition.endlessFloor || 1));
    const minLevel = Math.max(1, Number(averageLevel || (partyProfile && partyProfile.averageLevel) || 1) - 5);
    const maxLevel = Math.max(minLevel, Number(averageLevel || (partyProfile && partyProfile.averageLevel) || 1) + 5);
    const band = maxLevel - minLevel + 1;
    let nextLevel = minLevel + Math.floor(Math.random() * band);
    const upwardBiasChance = Math.min(0.82, 0.34 + floor * 0.032);

    if (Math.random() < upwardBiasChance) {
      nextLevel += 1 + Math.floor(floor / 9);
    }

    return clampNumber(nextLevel, minLevel, maxLevel);
  }

  function rollEnemyVariant(level, extraBudget) {
    const allocations = {
      maxHp: 0,
      str: 0,
      skl: 0,
      spd: 0,
      def: 0
    };
    const pointBudget = Math.max(2, 2 + Math.floor(Math.max(0, (level || 1) - 1) / 12) + (extraBudget || 0));

    for (let index = 0; index < pointBudget; index += 1) {
      const stat = ENEMY_VARIANT_STATS[Math.floor(Math.random() * ENEMY_VARIANT_STATS.length)];
      allocations[stat] += 1;
    }

    const dominantStat = ENEMY_VARIANT_STATS.reduce((bestStat, stat) => (
      allocations[stat] > allocations[bestStat] ? stat : bestStat
    ), ENEMY_VARIANT_STATS[0]);

    return {
      dominantStat,
      prefix: allocations[dominantStat] > 0 ? ENEMY_VARIANT_PREFIXES[dominantStat] : "",
      bonuses: {
        maxHp: allocations.maxHp * 2,
        str: allocations.str,
        skl: allocations.skl,
        spd: allocations.spd,
        def: allocations.def
      }
    };
  }

  function applyEnemyVariant(unit, variant) {
    if (!unit || !variant) {
      return unit;
    }

    unit.maxHp += variant.bonuses.maxHp || 0;
    unit.str += variant.bonuses.str || 0;
    unit.skl += variant.bonuses.skl || 0;
    unit.spd += variant.bonuses.spd || 0;
    unit.def += variant.bonuses.def || 0;
    unit.variant = {
      dominantStat: variant.dominantStat,
      prefix: variant.prefix
    };

    if (variant.prefix) {
      unit.name = `${variant.prefix} ${unit.name}`;
    }

    return unit;
  }

  function buildEnemyWeapon(type, level, overrides) {
    const rarity = level >= 3 ? "uncommon" : "common";
    const baseByType = {
      sword: { name: "적 철검", might: 5, hit: 82, rangeMin: 1, rangeMax: 1, uses: 40 },
      axe: { name: "적 철도끼", might: 7, hit: 74, rangeMin: 1, rangeMax: 1, uses: 36 },
      bow: { name: "적 사냥활", might: 5, hit: 86, rangeMin: 2, rangeMax: 2, uses: 34 },
      lance: { name: "적 철창", might: 6, hit: 80, rangeMin: 1, rangeMax: 1, uses: 38 }
    };

    const base = Object.assign({}, baseByType[type], clone(overrides || {}));

    return {
      id: `enemy-${type}-${Math.floor(Math.random() * 100000)}`,
      name: base.name,
      type,
      slot: "weapon",
      rarity,
      equippedBy: null,
      might: base.might + Math.max(0, level - 1),
      hit: base.hit + Math.min(8, level),
      rangeMin: base.rangeMin,
      rangeMax: base.rangeMax,
      uses: InventoryService && InventoryService.scaleWeaponDurabilityUses
        ? InventoryService.scaleWeaponDurabilityUses(base.uses)
        : base.uses
    };
  }

  function buildBossUnit(stageDefinition, averageLevel, partyProfile) {
    if (!stageDefinition.boss) {
      return null;
    }

    const boss = stageDefinition.boss;
    const level = stageDefinition.id === ENDLESS_STAGE_ID
      ? clampNumber(
          Math.max(
            averageLevel || 1,
            rollEnemyLevel(stageDefinition, averageLevel, partyProfile) + 2 + Math.floor(Number(boss.levelBonus || 0) / 2)
          ),
          Math.max(1, (averageLevel || 1) - 5),
          Math.max(1, (averageLevel || 1) + 5)
        )
      : Math.max(2, averageLevel + (boss.levelBonus || 0));
    const maxHp = 14 + level * 2 + (boss.maxHpBonus || 0);
    const bossUnit = {
      id: boss.id,
      name: boss.name,
      bossTitle: boss.title,
      isBoss: true,
      team: "enemy",
      className: boss.className,
      level,
      exp: 0,
      hp: maxHp,
      maxHp,
      str: 3 + level + ((boss.statBonuses && boss.statBonuses.str) || 0),
      skl: 3 + level + ((boss.statBonuses && boss.statBonuses.skl) || 0),
      spd: 2 + level + ((boss.statBonuses && boss.statBonuses.spd) || 0),
      def: 1 + level + ((boss.statBonuses && boss.statBonuses.def) || 0),
      mov: (boss.weaponType === "axe" ? 4 : 5) + (boss.movBonus || 0),
      x: boss.spawn.x,
      y: boss.spawn.y,
      acted: false,
      alive: true,
      weapon: buildEnemyWeapon(boss.weaponType, level + 1),
      statusEffects: [],
      skillCooldowns: {},
      specialSkillIds: clone(boss.specialSkillIds || []),
      specialActiveSkillIds: clone(boss.specialActiveSkillIds || [])
    };

    if (stageDefinition.id === ENDLESS_STAGE_ID) {
      applyEndlessPartyPressure(bossUnit, partyProfile, stageDefinition, { isBoss: true });
      applyEnemyEquipmentPackage(bossUnit, buildEndlessEnemyEquipmentPackage(bossUnit, stageDefinition, { isBoss: true }));
      applyEnemyVariant(bossUnit, rollEnemyVariant(level, 1));
      bossUnit.hp = bossUnit.maxHp;
    }

    return bossUnit;
  }

  function getRiftDefenseObjectivePressure(archetypeId, options) {
    if (options && options.isBoss) {
      return 18;
    }

    const pressureByArchetype = {
      dire_wolf: 12,
      harpy: 11,
      gargoyle: 10,
      basilisk: 10,
      orc_reaver: 9,
      skeleton_pikeman: 8,
      goblin_skirmisher: 8,
      raider_brute: 7,
      raider_soldier: 7,
      ghoul: 7
    };

    return pressureByArchetype[archetypeId] || 5;
  }

  function buildEnemyUnitFromArchetype(stageDefinition, averageLevel, partyProfile, archetype, spawn, index, options) {
    const nextOptions = options || {};
    const statBonuses = archetype.statBonuses || {};
    const level = Math.max(
      1,
      rollEnemyLevel(stageDefinition, averageLevel, partyProfile) + Number(nextOptions.levelBonus || 0)
    );
    const maxHp = Math.max(
      8,
      11 + level * 2 + (archetype.weaponType === "axe" ? 1 : 0) + (statBonuses.maxHp || 0)
        + Number(nextOptions.maxHpBonus || 0)
    );
    const unit = {
      id: `enemy-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`,
      name: archetype.namePool[Math.floor(Math.random() * archetype.namePool.length)],
      team: "enemy",
      className: archetype.className,
      level,
      exp: 0,
      hp: maxHp,
      maxHp,
      str: Math.max(1, 3 + level + (statBonuses.str || 0)),
      skl: Math.max(1, 3 + level + (statBonuses.skl || 0)),
      spd: Math.max(1, 2 + level + (statBonuses.spd || 0)),
      def: Math.max(0, 1 + level + (statBonuses.def || 0)),
      mov: Math.max(3, archetype.mov || (archetype.weaponType === "axe" ? 4 : 5)),
      x: spawn.x,
      y: spawn.y,
      acted: false,
      alive: true,
      weapon: buildEnemyWeapon(archetype.weaponType, level, archetype.weaponProfile),
      statusEffects: [],
      skillCooldowns: {},
      specialSkillIds: clone(archetype.specialSkillIds || []),
      specialActiveSkillIds: clone(archetype.specialActiveSkillIds || [])
    };

    if (stageDefinition.id === ENDLESS_STAGE_ID) {
      applyEndlessPartyPressure(unit, partyProfile, stageDefinition);
      applyEnemyEquipmentPackage(unit, buildEndlessEnemyEquipmentPackage(unit, stageDefinition));
      applyEnemyVariant(unit, rollEnemyVariant(level, 2));
    } else if (Number(nextOptions.variantBudget || 0) > 0 || Number(stageDefinition.enemyBonus || 0) >= 2) {
      applyEnemyVariant(unit, rollEnemyVariant(level, Math.max(1, Number(nextOptions.variantBudget || 0))));
    }

    if (isRiftDefenseStage(stageDefinition)) {
      unit.objectivePressure = getRiftDefenseObjectivePressure(archetype.id, nextOptions);
      unit.objectiveDamageBonus = Math.max(0, Number(nextOptions.objectiveDamageBonus || 0));
      unit.waveIndex = Number(nextOptions.waveIndex || 1);
    }

    unit.hp = nextOptions.forceFullHp
      ? unit.maxHp
      : Math.max(8, unit.maxHp - Math.max(0, Number(nextOptions.hpOffset || 0)));
    return unit;
  }

  function buildRiftDefenseBossUnit(stageDefinition, bossDefinition, averageLevel, partyProfile, waveIndex) {
    if (!bossDefinition) {
      return null;
    }

    const level = Math.max(
      2,
      averageLevel + Number(bossDefinition.levelBonus || 0) + Math.max(0, Number(waveIndex || 1) - 2)
    );
    const maxHp = 14 + level * 2 + Number(bossDefinition.maxHpBonus || 0);
    const bossUnit = {
      id: bossDefinition.id || `rift-defense-boss-${waveIndex}`,
      name: bossDefinition.name,
      bossTitle: bossDefinition.title,
      isBoss: true,
      team: "enemy",
      className: bossDefinition.className,
      level,
      exp: 0,
      hp: maxHp,
      maxHp,
      str: 3 + level + Number(bossDefinition.statBonuses && bossDefinition.statBonuses.str || 0),
      skl: 3 + level + Number(bossDefinition.statBonuses && bossDefinition.statBonuses.skl || 0),
      spd: 2 + level + Number(bossDefinition.statBonuses && bossDefinition.statBonuses.spd || 0),
      def: 1 + level + Number(bossDefinition.statBonuses && bossDefinition.statBonuses.def || 0),
      mov: (bossDefinition.weaponType === "axe" ? 4 : 5) + Number(bossDefinition.movBonus || 0),
      x: bossDefinition.spawn.x,
      y: bossDefinition.spawn.y,
      acted: false,
      alive: true,
      weapon: buildEnemyWeapon(bossDefinition.weaponType, level + 1),
      statusEffects: [],
      skillCooldowns: {},
      specialSkillIds: clone(bossDefinition.specialSkillIds || []),
      specialActiveSkillIds: clone(bossDefinition.specialActiveSkillIds || []),
      objectivePressure: getRiftDefenseObjectivePressure(null, { isBoss: true }),
      objectiveDamageBonus: 2,
      waveIndex: Number(waveIndex || 1)
    };

    return bossUnit;
  }

  function buildRiftDefenseWaveUnits(stageDefinition, waveIndex, options) {
    const selectedParty = getSelectedPartyUnits();
    const partyProfile = summarizePartyCombatProfile(selectedParty);
    const averageLevel = partyProfile.averageLevel;
    const waveDefinition = getRiftDefenseWaveDefinition(stageDefinition, waveIndex);

    if (!waveDefinition) {
      return [];
    }

    const nextOptions = options || {};
    const phase = nextOptions.phase || "player";
    const enemies = (waveDefinition.enemyArchetypeIds || []).map((archetypeId, index) => {
      const archetype = getEnemyArchetypeById(archetypeId);
      const spawnIndex = waveDefinition.spawnIndices && waveDefinition.spawnIndices[index] != null
        ? waveDefinition.spawnIndices[index]
        : index;
      const spawn = stageDefinition.enemySpawns[spawnIndex] || stageDefinition.enemySpawns[index] || stageDefinition.enemySpawns[0];
      const unit = buildEnemyUnitFromArchetype(stageDefinition, averageLevel, partyProfile, archetype, spawn, index, {
        waveIndex,
        forceFullHp: true,
        levelBonus: Math.max(0, waveIndex - 2),
        variantBudget: Number(waveDefinition.variantBudget || 0),
        objectiveDamageBonus: waveIndex >= 4 ? 1 : 0
      });
      unit.acted = phase === "enemy";
      return unit;
    });

    const bossUnit = buildRiftDefenseBossUnit(stageDefinition, waveDefinition.boss, averageLevel, partyProfile, waveIndex);

    if (bossUnit) {
      bossUnit.acted = phase === "enemy";
      enemies.push(bossUnit);
    }

    return enemies;
  }

  function prepareAlliesForBattle(stageDefinition) {
    return getSelectedPartyUnits().map((unit, index) => {
      const spawn = stageDefinition.allySpawns[index] || stageDefinition.allySpawns[stageDefinition.allySpawns.length - 1];
      const nextUnit = InventoryService.getEffectiveUnitStats(state.saveData, clone(unit));
      SkillsService.normalizeUnitLearnedSkills(nextUnit);
      nextUnit.team = "ally";
      nextUnit.isLeader = state.saveData.leaderUnitId === unit.id;
      nextUnit.alive = true;
      nextUnit.acted = false;
      nextUnit.x = spawn.x;
      nextUnit.y = spawn.y;
      nextUnit.weapon = resolveWeaponForUnit(nextUnit);
      applyEndlessRelicsToUnit(nextUnit);
      nextUnit.hp = nextUnit.maxHp;
      initializeUnitBattleState(nextUnit);
      return nextUnit;
    });
  }

  function promoteEndlessElite(unit, floor, eliteIndex) {
    if (!unit) {
      return unit;
    }

    const weaponType = unit.weapon ? unit.weapon.type : "sword";
    const eliteProfile = ENDLESS_ELITE_PROFILES[weaponType] || ENDLESS_ELITE_PROFILES.sword;
    const eliteTrait = ENDLESS_ELITE_TRAITS[(floor + eliteIndex - 1) % ENDLESS_ELITE_TRAITS.length];
    const tierBonus = 1 + Math.floor(Math.max(1, floor || 1) / 6);

    unit.isElite = true;
    unit.eliteIndex = eliteIndex;
    unit.eliteTitle = eliteProfile.title;
    unit.eliteTraitId = eliteTrait.id;
    unit.eliteTraitName = eliteTrait.name;
    unit.eliteTraitDescription = eliteTrait.description;
    unit.level += tierBonus;
    unit.maxHp += 4 + tierBonus * 2;
    unit.hp = unit.maxHp;
    unit.str += 2 + tierBonus;
    unit.skl += 1 + tierBonus;
    unit.spd += 1 + Math.floor(tierBonus / 2);
    unit.def += 1 + tierBonus;
    unit.str += eliteTrait.statBonuses.str || 0;
    unit.skl += eliteTrait.statBonuses.skl || 0;
    unit.spd += eliteTrait.statBonuses.spd || 0;
    unit.def += eliteTrait.statBonuses.def || 0;
    unit.maxHp += eliteTrait.statBonuses.maxHp || 0;
    unit.hp = unit.maxHp;
    unit.mov += floor >= 14 ? 1 : 0;
    unit.specialSkillIds = Array.from(new Set((unit.specialSkillIds || []).concat(eliteProfile.passiveSkillIds || [])));
    unit.specialActiveSkillIds = Array.from(
      new Set((unit.specialActiveSkillIds || []).concat(eliteProfile.activeSkillIds || [], eliteTrait.activeSkillIds || []))
    );
    unit.statusEffects = unit.statusEffects || [];
    unit.statusEffects.push(createEliteTraitEffect(eliteTrait));
    unit.rewardBias = Math.min(4, tierBonus);
    unit.hiddenStats = Object.assign({}, clone(unit.hiddenStats || {}));
    unit.hiddenStats.physicalAttack = Math.round(Number(unit.hiddenStats.physicalAttack || unit.str) + 3 + tierBonus);
    unit.hiddenStats.magicAttack = Math.round(Number(unit.hiddenStats.magicAttack || unit.skl) + 2 + Math.floor(tierBonus / 2));
    unit.hiddenStats.accuracy = Math.round(Number(unit.hiddenStats.accuracy || (unit.skl * 5)) + 6 + tierBonus * 2);
    unit.hiddenStats.evasion = Math.round(Number(unit.hiddenStats.evasion || (unit.spd * 3)) + 4 + tierBonus);
    unit.hiddenStats.physicalDefense = Math.round(Number(unit.hiddenStats.physicalDefense || unit.def) + 4 + tierBonus);
    unit.hiddenStats.magicDefense = Math.round(Number(unit.hiddenStats.magicDefense || unit.def) + 3 + tierBonus);
    unit.hiddenStats.critChance = Math.max(
      0,
      Math.round(Number(unit.hiddenStats.critChance || 0) + 2 + Math.floor(tierBonus / 2))
    );
    return unit;
  }

  function createEnemyUnits(stageDefinition) {
    if (isSupportFloorType(stageDefinition.floorType)) {
      return [];
    }

    if (isRiftDefenseStage(stageDefinition)) {
      return buildRiftDefenseWaveUnits(stageDefinition, 1);
    }

    const selectedParty = getSelectedPartyUnits();
    const allyCount = selectedParty.length || 3;
    const partyProfile = summarizePartyCombatProfile(selectedParty);
    const averageLevel = partyProfile.averageLevel;
    const isEndlessStage = stageDefinition.id === ENDLESS_STAGE_ID;
    const endlessFloor = Math.max(1, Number(stageDefinition.endlessFloor || 1));
    const earlyEndless = isEndlessStage && endlessFloor <= 3;
    const bonusEnemy = !earlyEndless && averageLevel >= 3 && Math.random() < (isEndlessStage ? 0.72 : 0.55) ? 1 : 0;
    const endlessPressureBonus = isEndlessStage
      ? (earlyEndless ? 0 : 1) + Math.floor(Math.max(0, endlessFloor - 2) / 5) + (endlessFloor >= 12 ? 1 : 0)
      : 0;
    const enemyCount = Math.min(
      stageDefinition.enemySpawns.length,
      Math.max(
        isEndlessStage ? 3 : 2,
        allyCount + (earlyEndless ? 0 : 1) + bonusEnemy + endlessPressureBonus - (stageDefinition.boss ? 1 : 0)
      )
    );
    const archetypeSequence = buildEnemyArchetypeSequence(stageDefinition, enemyCount);
    const enemies = stageDefinition.enemySpawns.slice(0, enemyCount).map((spawn, index) => {
      const archetype = archetypeSequence[index] || pickEnemyArchetype(stageDefinition);
      return buildEnemyUnitFromArchetype(stageDefinition, averageLevel, partyProfile, archetype, spawn, index, {
        hpOffset: index === enemyCount - 1 ? 3 : 0,
        variantBudget: Number(stageDefinition.enemyBonus || 0) >= 2 ? 1 : 0
      });
    });

    const bossUnit = buildBossUnit(stageDefinition, averageLevel, partyProfile);

    if (bossUnit) {
      enemies.push(bossUnit);
    }

    if (stageDefinition.id === ENDLESS_STAGE_ID && (stageDefinition.floorType === "combat" || stageDefinition.floorType === "boss")) {
      const floor = stageDefinition.endlessFloor || 1;
      const eliteCandidates = enemies.filter((unit) => !unit.isBoss);
      const eliteCount = Math.min(
        eliteCandidates.length,
        floor >= 20 ? 4 : floor >= 12 ? 3 : floor >= 6 ? 2 : floor >= 3 ? 1 : 0
      );

      for (let index = 0; index < eliteCount; index += 1) {
        promoteEndlessElite(eliteCandidates[index], floor, index + 1);
      }
    }

    return enemies;
  }

  function createBattleState() {
    const stageDefinition = getCurrentStageDefinition();
    const allies = prepareAlliesForBattle(stageDefinition);
    const enemies = createEnemyUnits(stageDefinition);
    const stageIntroLines = stageDefinition.introLines || [];
    const introLines = [
      `${stageDefinition.name} 전투가 시작되었습니다.`,
      "아군 턴입니다. 유닛을 선택해 이동하거나 공격하세요."
    ].concat(stageIntroLines);
    const bossUnit = enemies.find((unit) => unit.isBoss);

    const battle = {
      id: `battle-${Date.now()}`,
      stageId: stageDefinition.id,
      stageName: stageDefinition.name,
      status: "in_progress",
      objective: stageDefinition.objective,
      contentMode: stageDefinition.contentMode || (stageDefinition.id === ENDLESS_STAGE_ID ? "endless-rift" : "normal"),
      allySpawns: clone(stageDefinition.allySpawns),
      bossUnitId: bossUnit ? bossUnit.id : null,
      victoryCondition: stageDefinition.victoryCondition || "route_enemy",
      defeatCondition: stageDefinition.defeatCondition || "leader_down",
      cutsceneTitle: stageDefinition.cutsceneTitle || `${stageDefinition.name} 브리핑`,
      cutsceneLines: clone(stageIntroLines),
      cutsceneSeen: false,
      endlessFloor: stageDefinition.endlessFloor || null,
      floorType: stageDefinition.floorType || "combat",
      specialRule: clone(stageDefinition.specialRule || null),
      pendingChoice: clone(stageDefinition.pendingChoice || null),
      deferredChoice: clone(stageDefinition.deferredChoice || null),
      phase: "player",
      turnNumber: 1,
      map: createMap(stageDefinition),
      units: allies.concat(enemies),
      logs: introLines,
      triggeredEventIds: [],
      grantedRewardIds: [],
      lastEventText: stageIntroLines[stageIntroLines.length - 1] || "",
      rewardHistory: [],
      rewardGold: stageDefinition.rewardGold,
      rewardExp: 0,
      rewardsGranted: false,
      defenseState: isRiftDefenseStage(stageDefinition)
        ? {
            objectiveHp: Number(stageDefinition.defenseObjective && stageDefinition.defenseObjective.hp || 40),
            objectiveMaxHp: Number(stageDefinition.defenseObjective && stageDefinition.defenseObjective.hp || 40),
            objectivePosition: {
              x: Number(stageDefinition.defenseObjective && stageDefinition.defenseObjective.x || 0),
              y: Number(stageDefinition.defenseObjective && stageDefinition.defenseObjective.y || 0)
            },
            waveIndex: 1,
            totalWaves: Array.isArray(stageDefinition.waves) ? stageDefinition.waves.length : 0,
            enemiesRemainingInWave: enemies.filter((unit) => unit.team === "enemy" && unit.alive).length,
            pendingReinforcement: null,
            waveTransitionLocked: false,
            battleResolved: false,
            clearedWaves: [],
            lastBanner: "제1웨이브 시작 - 전선 형성",
            earnedRewards: {
              base: {
                gold: 0,
                refineStone: 0,
                exp: 0
              },
              bonus: {
                gold: 0,
                refineStone: 0,
                exp: 0,
                equipment: []
              }
            }
          }
        : null
    };

    applySupportFloorBenefits(stageDefinition, battle);
    applyBattlefieldRuleEffects(stageDefinition, battle);

    const eliteUnits = battle.units.filter((unit) => unit.isElite);

    if (eliteUnits.length) {
      battle.logs.push(
        `정예 반응 감지: ${eliteUnits.map((unit) => `${unit.name} ${unit.eliteTitle} [${unit.eliteTraitName}]`).join(", ")}`
      );
      battle.lastEventText = `정예 적 ${eliteUnits.length}체가 전장에 섞여 있다.`;
    }

    if (isRiftDefenseStage(stageDefinition) && battle.defenseState) {
      battle.rewardGold = 0;
      battle.logs.push("거점 방어를 시작합니다. 적을 막아 거점 HP를 유지하세요.");
      battle.logs.push(battle.defenseState.lastBanner);
      battle.lastEventText = battle.defenseState.lastBanner;
    }

    return battle;
  }

  function getRiftDefenseRewardTotals(defenseState) {
    const earnedRewards = defenseState && defenseState.earnedRewards
      ? defenseState.earnedRewards
      : { base: {}, bonus: { equipment: [] } };
    return {
      gold: Number(earnedRewards.base.gold || 0) + Number(earnedRewards.bonus.gold || 0),
      refineStone: Number(earnedRewards.base.refineStone || 0) + Number(earnedRewards.bonus.refineStone || 0),
      exp: Number(earnedRewards.base.exp || 0) + Number(earnedRewards.bonus.exp || 0),
      equipment: clone(earnedRewards.bonus.equipment || [])
    };
  }

  function updateRiftDefenseRewardPreview() {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return;
    }

    const totals = getRiftDefenseRewardTotals(state.battle.defenseState);
    state.battle.rewardGold = totals.gold;
    state.battle.rewardExp = totals.exp;
  }

  function awardRiftDefenseWaveRewards(waveIndex) {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return;
    }

    const defenseState = state.battle.defenseState;

    if (defenseState.clearedWaves.includes(waveIndex)) {
      return;
    }

    const waveDefinition = getRiftDefenseWaveDefinition(getStageDefinitionById(state.battle.stageId), waveIndex);
    const reward = waveDefinition && waveDefinition.reward
      ? waveDefinition.reward
      : { gold: 0, refineStone: 0, exp: 0 };

    defenseState.clearedWaves.push(waveIndex);
    defenseState.earnedRewards.base.gold += Number(reward.gold || 0);
    defenseState.earnedRewards.base.refineStone += Number(reward.refineStone || 0);
    defenseState.earnedRewards.base.exp += Number(reward.exp || 0);
    updateRiftDefenseRewardPreview();
    addLog(`웨이브 ${waveIndex} 방어 성공. 누적 보상: ${reward.gold || 0}G / 재련석 ${reward.refineStone || 0} / EXP ${reward.exp || 0}`);
  }

  function prepareRiftDefenseVictoryBonus() {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return;
    }

    const defenseState = state.battle.defenseState;

    if (defenseState.bonusPrepared) {
      return;
    }

    const objectiveRatio = Number(defenseState.objectiveMaxHp || 0) > 0
      ? Number(defenseState.objectiveHp || 0) / Number(defenseState.objectiveMaxHp || 1)
      : 0;
    const objectiveGoldBonus = objectiveRatio >= 0.7
      ? 24
      : objectiveRatio >= 0.4
        ? 12
        : 0;
    const objectiveStoneBonus = objectiveRatio >= 0.7 ? 1 : 0;
    const selectedParty = getSelectedPartyUnits();
    const averageLevel = summarizePartyCombatProfile(selectedParty).averageLevel || 1;
    const bonusItem = InventoryService.createLootDrop(averageLevel + 2, { qualityBias: 0.08 });

    defenseState.earnedRewards.bonus.gold += 42 + objectiveGoldBonus;
    defenseState.earnedRewards.bonus.refineStone += 1 + objectiveStoneBonus;
    defenseState.earnedRewards.bonus.exp += 24;
    defenseState.earnedRewards.bonus.equipment = [bonusItem];
    defenseState.bonusPrepared = true;
    updateRiftDefenseRewardPreview();
  }

  function applyRiftDefenseRewards() {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return;
    }

    if (state.battle.rewardsGranted) {
      return;
    }

    if (state.battle.status === "victory") {
      prepareRiftDefenseVictoryBonus();
    }

    const totals = getRiftDefenseRewardTotals(state.battle.defenseState);
    state.battle.rewardGold = totals.gold;
    state.battle.rewardExp = totals.exp;

    if (totals.gold > 0) {
      state.saveData.partyGold += totals.gold;
    }

    if (totals.exp > 0) {
      grantPartyExperience(totals.exp);
    }

    if (totals.refineStone > 0) {
      const item = InventoryService.createMiscItemStack("refine-stone-basic", totals.refineStone);
      InventoryService.addItemToInventory(state.saveData, item);
      state.battle.rewardHistory.push(item);
    }

    totals.equipment.forEach((item) => {
      InventoryService.addItemToInventory(state.saveData, item);
      state.battle.rewardHistory.push(item);
    });

    state.battle.rewardsGranted = true;
  }

  function beginNextRiftDefenseWave() {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState || state.battle.defenseState.waveTransitionLocked) {
      return false;
    }

    const defenseState = state.battle.defenseState;
    const stageDefinition = getStageDefinitionById(state.battle.stageId);
    const currentWave = Number(defenseState.waveIndex || 1);

    if (currentWave >= Number(defenseState.totalWaves || 0)) {
      return false;
    }

    defenseState.waveTransitionLocked = true;
    awardRiftDefenseWaveRewards(currentWave);
    addLog(`웨이브 ${currentWave} 정리 완료.`);
    defenseState.waveIndex = currentWave + 1;
    const reinforcements = buildRiftDefenseWaveUnits(stageDefinition, defenseState.waveIndex, {
      phase: state.battle.phase
    });
    state.battle.units = state.battle.units.concat(reinforcements);
    state.battle.bossUnitId = reinforcements.find((unit) => unit.isBoss)
      ? reinforcements.find((unit) => unit.isBoss).id
      : null;
    defenseState.pendingReinforcement = reinforcements.map((unit) => unit.id);
    defenseState.enemiesRemainingInWave = reinforcements.filter((unit) => unit.team === "enemy" && unit.alive).length;
    defenseState.lastBanner = (getRiftDefenseWaveDefinition(stageDefinition, defenseState.waveIndex) || {}).banner || "";
    addLog(defenseState.lastBanner || `제${defenseState.waveIndex}웨이브 시작`);
    state.battle.lastEventText = defenseState.lastBanner || `제${defenseState.waveIndex}웨이브 시작`;
    defenseState.pendingReinforcement = null;
    defenseState.waveTransitionLocked = false;
    updateRiftDefenseRewardPreview();
    return true;
  }

  function resetUiState() {
    state.ui.selectedUnitId = null;
    state.ui.reachableTiles = [];
    state.ui.attackTiles = [];
    state.ui.attackableTargetIds = [];
    state.ui.pendingAttack = false;
    state.ui.skillTiles = [];
    state.ui.skillTargetIds = [];
    state.ui.pendingMove = null;
    state.ui.movePreview = null;
    state.ui.pendingSkillId = null;
    state.ui.activePanel = "unit";
  }

  function launch(options) {
    state.active = true;
    state.userId = options.userId;
    state.saveData = options.saveData;
    state.settings = options.settings;
    StatsService.normalizeRosterProgression(state.saveData);
    SkillsService.normalizeRosterLearnedSkills(state.saveData);
    ensureCampaignState();
    ensureEndlessState();
    ensureRiftDefenseState();

    if (!options.resume && isStageReplayLocked(state.saveData, state.saveData.stageId)) {
      throw new Error("프롤로그는 클리어 후 다시 입장할 수 없습니다.");
    }

    if (options.resume && state.saveData.battleState && state.saveData.stageStatus === "in_progress") {
      state.battle = clone(state.saveData.battleState);
    } else {
      if (state.saveData.stageId === ENDLESS_STAGE_ID) {
        beginEndlessRunIfNeeded();
      }

      state.battle = createBattleState();
      state.saveData.stageId = state.battle.map.id;
      state.saveData.stageStatus = "in_progress";
      state.saveData.turnNumber = 1;
      state.saveData.phase = "player";
      state.saveData.battleState = clone(state.battle);
    }

    hydrateBattleState();

    if (state.battle && state.battle.stageId === ENDLESS_STAGE_ID) {
      ensureEndlessRunState();
    }

    resetUiState();
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
  }

  function leaveBattle() {
    if (isRiftDefenseBattle(state.battle) && state.battle.status === "in_progress") {
      state.battle.status = "defeat";
      state.battle.resultOverlaySuppressed = true;
      applyRiftDefenseRewards();
      state.saveData.battleState = null;
      markCampaignDefeat();
      finishBattlePersistence();
      state.saveData.stageStatus = "ready";
    }

    state.active = false;
    resetUiState();
    notify();
  }

  function addLog(message) {
    state.battle.logs.push(message);

    if (state.battle.logs.length > 80) {
      state.battle.logs = state.battle.logs.slice(-80);
    }
  }

  function getBossUnit() {
    if (!state.battle || !state.battle.bossUnitId) {
      return null;
    }

    return getUnitById(state.battle.bossUnitId);
  }

  function triggerStageEvent(eventDefinition) {
    if (!state.battle || !eventDefinition || (state.battle.triggeredEventIds || []).includes(eventDefinition.id)) {
      return;
    }

    state.battle.triggeredEventIds.push(eventDefinition.id);
    (eventDefinition.lines || []).forEach((line) => addLog(`[연출] ${line}`));
    state.battle.lastEventText = (eventDefinition.lines || []).slice(-1)[0] || state.battle.lastEventText;
  }

  function evaluateStageEvents(trigger, payload) {
    if (!state.battle) {
      return;
    }

    const stageDefinition = getStageDefinitionById(state.battle.stageId);
    const bossUnit = getBossUnit();

    (stageDefinition.events || []).forEach((eventDefinition) => {
      if (eventDefinition.trigger !== trigger) {
        return;
      }

      if ((state.battle.triggeredEventIds || []).includes(eventDefinition.id)) {
        return;
      }

      if (trigger === "turn_start") {
        if (eventDefinition.turn !== state.battle.turnNumber) {
          return;
        }

        if (eventDefinition.phase && eventDefinition.phase !== state.battle.phase) {
          return;
        }
      }

      if (trigger === "boss_hp_half") {
        if (!bossUnit || !bossUnit.alive || bossUnit.hp > Math.floor(bossUnit.maxHp / 2)) {
          return;
        }
      }

      if (trigger === "boss_defeated") {
        if (!payload || !payload.unit || payload.unit.id !== state.battle.bossUnitId) {
          return;
        }
      }

      triggerStageEvent(eventDefinition);
    });
  }

  function getVictoryProgressText() {
    if (!state.battle) {
      return "없음";
    }

    if (isRiftDefenseBattle(state.battle) && state.battle.defenseState) {
      const defenseState = state.battle.defenseState;
      return `웨이브 ${defenseState.waveIndex}/${defenseState.totalWaves} / 거점 ${defenseState.objectiveHp}/${defenseState.objectiveMaxHp}`;
    }

    if (state.battle.victoryCondition === "support_complete") {
      return state.battle.pendingChoice ? "보상을 선택한 뒤 다음 층으로 이동" : "정비가 끝나면 다음 층으로 이동";
    }

    const bossUnit = getBossUnit();
    const bossState = bossUnit && bossUnit.alive ? `${bossUnit.name} 생존` : "보스 격파";
    const aliveEnemies = getAliveUnitsByTeam("enemy").length;

    if (state.battle.victoryCondition === "boss_defeat") {
      return bossState;
    }

    if (state.battle.victoryCondition === "boss_or_route") {
      return `${bossState} / 적 ${aliveEnemies}명 잔존`;
    }

    return `적 ${aliveEnemies}명 잔존`;
  }

  function getEndlessRunSummary(saveData) {
    const endless = saveData && saveData.endless
      ? saveData.endless
      : {
          lastRun: null
        };

    return clone(endless.lastRun || null);
  }

  function getEndlessCurrentRunSummary(saveData) {
    const endless = saveData && saveData.endless
      ? saveData.endless
      : {
          currentRun: null
        };

    return clone(endless.currentRun || null);
  }

  function grantBossFixedReward(unit) {
    if (!unit || !unit.isBoss || !state.battle) {
      return null;
    }

    const stageDefinition = getStageDefinitionById(state.battle.stageId);
    const rewardDefinition = stageDefinition.boss && stageDefinition.boss.id === unit.id
      ? stageDefinition.boss.fixedDrop
      : null;

    if (!rewardDefinition) {
      return null;
    }

    state.battle.grantedRewardIds = state.battle.grantedRewardIds || [];

    if (state.battle.grantedRewardIds.includes(unit.id)) {
      return null;
    }

    const item = InventoryService.createRewardItem(rewardDefinition);
    InventoryService.addItemToInventory(state.saveData, item);
    state.saveData.collection = state.saveData.collection || { discoveredRewardIds: [] };
    state.saveData.collection.discoveredRewardIds = state.saveData.collection.discoveredRewardIds || [];
    if (!state.saveData.collection.discoveredRewardIds.includes(rewardDefinition.idPrefix)) {
      state.saveData.collection.discoveredRewardIds.push(rewardDefinition.idPrefix);
    }
    state.battle.rewardHistory.push(item);
    updateEndlessRunStat((currentRun) => {
      currentRun.itemsLooted += 1;
    });
    state.battle.grantedRewardIds.push(unit.id);
    addLog(`보스 전리품 획득: ${item.name} (${InventoryService.getRarityMeta(item.rarity).label})`);
    return item;
  }

  function grantRecruitRewards(stageId) {
    const recruitRewards = RECRUIT_DEFINITIONS[stageId] || [];
    const recruitedUnits = [];

    recruitRewards.forEach((reward) => {
      const alreadyOwned = (state.saveData.roster || []).some((unit) => unit.id === reward.unit.id);

      if (alreadyOwned) {
        return;
      }

      const unit = clone(reward.unit);
      const items = clone(reward.items || []);

      StatsService.normalizeUnitProgression(unit);
      SkillsService.normalizeUnitLearnedSkills(unit);
      state.saveData.roster.push(unit);
      items.forEach((item) => InventoryService.addItemToInventory(state.saveData, item));
      state.saveData.selectedPartyIds = state.saveData.selectedPartyIds || [];

      if (state.saveData.selectedPartyIds.length < ALLY_SPAWNS.length) {
        state.saveData.selectedPartyIds.push(unit.id);
      }

      recruitedUnits.push(unit.name);
      addLog(`동료 합류: ${unit.name} (${unit.className})`);
    });

    return recruitedUnits;
  }

  function updatePersistentUnitsFromBattle() {
    (state.saveData.roster || []).forEach((persistentUnit) => {
      const battleUnit = state.battle.units.find((unit) => unit.id === persistentUnit.id);

      if (!battleUnit) {
        return;
      }

      persistentUnit.level = battleUnit.level;
      persistentUnit.exp = battleUnit.exp;
      persistentUnit.primaryStats = clone(battleUnit.primaryStats || persistentUnit.primaryStats || null);
      persistentUnit.hiddenStats = clone(battleUnit.hiddenStats || persistentUnit.hiddenStats || null);
      persistentUnit.maxHp = battleUnit.maxHp;
      persistentUnit.str = battleUnit.str;
      persistentUnit.skl = battleUnit.skl;
      persistentUnit.spd = battleUnit.spd;
      persistentUnit.def = battleUnit.def;
      persistentUnit.mov = battleUnit.mov;
      persistentUnit.statPoints = battleUnit.statPoints || 0;
      persistentUnit.skillPoints = battleUnit.skillPoints || 0;
      persistentUnit.potentialScore = battleUnit.potentialScore || persistentUnit.potentialScore || 0;
      persistentUnit.trainingLevel = battleUnit.trainingLevel || 0;
      persistentUnit.trainingAttempts = battleUnit.trainingAttempts || 0;
      persistentUnit.spentPrimaryStats = clone(battleUnit.spentPrimaryStats || persistentUnit.spentPrimaryStats || {});
      persistentUnit.learnedSkillIds = clone(battleUnit.learnedSkillIds || persistentUnit.learnedSkillIds || []);
      persistentUnit.learnedActiveSkillIds = clone(battleUnit.learnedActiveSkillIds || persistentUnit.learnedActiveSkillIds || []);
      persistentUnit.equippedActiveSkillIds = clone(battleUnit.equippedActiveSkillIds || persistentUnit.equippedActiveSkillIds || []);
      persistentUnit.skillLevels = clone(battleUnit.skillLevels || persistentUnit.skillLevels || {});
      persistentUnit.equippedItemIds = clone(battleUnit.equippedItemIds || []);
      persistentUnit.weapon = battleUnit.weapon ? battleUnit.weapon.id : null;
    });
  }

  function updateInventoryDurabilityFromBattle() {
    state.battle.units.forEach((unit) => {
      if (!unit.weapon || unit.team !== "ally") {
        return;
      }

      const item = getPersistentItem(unit.weapon.id);

      if (item) {
        item.uses = unit.weapon.uses;
        item.equippedBy = unit.id;
      }
    });
  }

  function syncPersistentFromBattle(options) {
    if (!state.saveData || !state.battle) {
      return;
    }

    updatePersistentUnitsFromBattle();
    updateInventoryDurabilityFromBattle();

    state.saveData.turnNumber = state.battle.turnNumber;
    state.saveData.phase = state.battle.phase;
    state.saveData.battleState = options && options.keepBattleState === false ? null : clone(state.battle);
  }

  function getSnapshot() {
    return {
      active: state.active,
      userId: state.userId,
      battle: clone(state.battle),
      ui: clone(state.ui),
      saveData: clone(state.saveData),
      settings: clone(state.settings)
    };
  }

  function buildReachableTiles(unit, allowOccupiedOrigin, movementLimitOverride) {
    const movementLimit = Number.isFinite(movementLimitOverride) ? movementLimitOverride : unit.mov;
    const queue = [{ x: unit.x, y: unit.y, cost: 0, path: [] }];
    const visited = new Map();
    const reachable = [];
    const originKey = `${unit.x},${unit.y}`;
    visited.set(originKey, 0);

    while (queue.length) {
      const current = queue.shift();

      [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 }
      ].forEach((next) => {
        const key = `${next.x},${next.y}`;

        if (!isTilePassable(next.x, next.y)) {
          return;
        }

        const terrainCost = getTileMovementCost(next.x, next.y);
        const climbCost = Math.max(0, getTileElevation(next.x, next.y) - getTileElevation(current.x, current.y));
        const nextCost = current.cost + terrainCost + climbCost;

        if (!Number.isFinite(nextCost) || nextCost > movementLimit) {
          return;
        }

        const occupant = getUnitAt(next.x, next.y);
        const isOrigin = next.x === unit.x && next.y === unit.y;
        const isFriendlyOccupant = occupant && unit.team === "ally" && occupant.team === unit.team;

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
          path: nextPath,
          elevation: getTileElevation(next.x, next.y)
        });

        if ((!(occupant && !isOrigin) || !isFriendlyOccupant) && (!isOrigin || allowOccupiedOrigin)) {
          reachable.push({
            x: next.x,
            y: next.y,
            cost: nextCost,
            path: nextPath,
            elevation: getTileElevation(next.x, next.y)
          });
        }
      });
    }

    if (allowOccupiedOrigin) {
      reachable.unshift({ x: unit.x, y: unit.y, cost: 0, path: [], elevation: getTileElevation(unit.x, unit.y) });
    }

    return reachable;
  }

  function collectAttackTilesFromPositions(unit, positions, options) {
    const tiles = [];
    const seen = new Set();
    const nextOptions = options || {};

    positions.forEach((origin) => {
      const originContext = {
        attackerTileType: getTileType(origin.x, origin.y),
        attackerElevation: getTileElevation(origin.x, origin.y),
        defenderTileType: getTileType(origin.x, origin.y),
        defenderElevation: getTileElevation(origin.x, origin.y)
      };
      const displayRange = nextOptions.ignoreMinRange
        ? CombatService.getEffectiveWeaponRange(unit, originContext)
        : null;

      for (let y = 0; y < state.battle.map.height; y += 1) {
        for (let x = 0; x < state.battle.map.width; x += 1) {
          const context = {
            attackerTileType: getTileType(origin.x, origin.y),
            attackerElevation: getTileElevation(origin.x, origin.y),
            defenderTileType: getTileType(x, y),
            defenderElevation: getTileElevation(x, y)
          };
          const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y);
          const effectiveRange = CombatService.getEffectiveWeaponRange(unit, context);
          const isDisplayRange = nextOptions.ignoreMinRange
            ? distance > 0 && distance <= displayRange.rangeMax
            : CombatService.isInWeaponRange(unit, origin, { x, y }, context);

          if (isDisplayRange) {
            const key = `${x},${y}`;

            if (!seen.has(key)) {
              seen.add(key);
              tiles.push({ x, y });
            }
          }
        }
      }
    });

    return tiles;
  }

  function collectAttackableTargets(unit, origin) {
    return state.battle.units
      .filter((candidate) => candidate.alive && candidate.team !== unit.team)
      .filter((candidate) => CombatService.isInWeaponRange(unit, origin, { x: candidate.x, y: candidate.y }, {
        attackerTileType: getTileType(origin.x, origin.y),
        attackerElevation: getTileElevation(origin.x, origin.y),
        defenderTileType: getTileType(candidate.x, candidate.y),
        defenderElevation: getTileElevation(candidate.x, candidate.y)
      }))
      .map((candidate) => candidate.id);
  }

  function calculatePreviewFromOrigin(attacker, origin, defender) {
    const simulatedAttacker = Object.assign({}, attacker, {
      x: origin.x,
      y: origin.y
    });

    if (attacker.weapon) {
      simulatedAttacker.weapon = clone(attacker.weapon);
    }

    return CombatService.calculatePreview(simulatedAttacker, defender, {
      attackerTileType: getTileType(origin.x, origin.y),
      defenderTileType: getTileType(defender.x, defender.y),
      attackerElevation: getTileElevation(origin.x, origin.y),
      defenderElevation: getTileElevation(defender.x, defender.y),
      phase: state.battle.phase,
      isInitiator: true
    });
  }

  function calculateCounterPreview(attacker, defender) {
    if (!attacker || !defender || !attacker.alive || !defender.alive) {
      return {
        canCounter: false,
        hitRate: 0,
        damage: 0
      };
    }

    const counterAllowed = CombatService.isInWeaponRange(defender, { x: defender.x, y: defender.y }, { x: attacker.x, y: attacker.y }, {
      attackerTileType: getTileType(defender.x, defender.y),
      attackerElevation: getTileElevation(defender.x, defender.y),
      defenderTileType: getTileType(attacker.x, attacker.y),
      defenderElevation: getTileElevation(attacker.x, attacker.y)
    });

    if (!counterAllowed) {
      return {
        canCounter: false,
        hitRate: 0,
        damage: 0
      };
    }

    const preview = CombatService.calculatePreview(defender, attacker, {
      attackerTileType: getTileType(defender.x, defender.y),
      defenderTileType: getTileType(attacker.x, attacker.y),
      attackerElevation: getTileElevation(defender.x, defender.y),
      defenderElevation: getTileElevation(attacker.x, attacker.y),
      phase: state.battle.phase,
      isInitiator: false,
      isCounter: true
    });

    return Object.assign({ canCounter: preview.canAttack }, preview);
  }

  function tryCounterAttack(attacker, defender) {
    const counterPreview = calculateCounterPreview(attacker, defender);

    if (!counterPreview.canCounter || !attacker.alive || !defender.alive) {
      return null;
    }

    const result = CombatService.resolveAttack(defender, attacker, {
      attackerTileType: getTileType(defender.x, defender.y),
      defenderTileType: getTileType(attacker.x, attacker.y),
      attackerElevation: getTileElevation(defender.x, defender.y),
      defenderElevation: getTileElevation(attacker.x, attacker.y),
      phase: state.battle.phase,
      isInitiator: false,
      isCounter: true
    });

    if (result.didHit) {
      addLog(`반격: ${defender.name} -> ${attacker.name}: ${result.damageDealt} 피해${result.didCrit ? " / 치명타!" : ""}`);
      applyOnHitAilments(defender, attacker, `${defender.name}의 반격`);
      applyLifeSteal(defender, result.damageDealt, "반격 흡혈");
      updateEndlessRunStat((currentRun) => {
        if (defender.team === "ally") {
          currentRun.damageDealt += result.damageDealt;
        } else {
          currentRun.damageTaken += result.damageDealt;
        }
      });
    } else {
      addLog(`${defender.name}의 반격이 빗나갔습니다.`);
    }

    if (result.preview.triggeredSkills && result.preview.triggeredSkills.length) {
      addLog(`스킬 발동: ${result.preview.triggeredSkills.join(", ")}`);
    }

    if (result.preview.elevationNote) {
      addLog(`지형 보정: ${result.preview.elevationNote}`);
    }

    if (result.targetDefeated) {
      handleUnitDefeat(attacker);
      applyOnKillRewards(attacker, defender, "반격 마무리");
      maybeGrantLoot(attacker, defender);
    }

    return result;
  }

  function getActiveSkills(unit) {
    return SkillsService.getEquippedActiveSkillsForUnit(unit).map((skill) => {
      const cooldownRemaining = (unit.skillCooldowns && unit.skillCooldowns[skill.id]) || 0;
      return Object.assign({}, skill, {
        cooldownRemaining
      });
    });
  }

  function getSkillById(unit, skillId) {
    return getActiveSkills(unit).find((skill) => skill.id === skillId) || null;
  }

  function canUseSkillOnCurrentTerrain(unit, skill) {
    if (!skill || !skill.requiredTileTypes || !skill.requiredTileTypes.length) {
      return true;
    }

    return skill.requiredTileTypes.includes(getTileType(unit.x, unit.y));
  }

  function getSkillRange(skill, unit) {
    const weapon = unit.weapon || {};
    const effectiveRange = CombatService.getEffectiveWeaponRange(unit, {
      attackerTileType: getTileType(unit.x, unit.y),
      attackerElevation: getTileElevation(unit.x, unit.y),
      defenderElevation: getTileElevation(unit.x, unit.y)
    });

    return {
      rangeMin: skill.useWeaponRange ? effectiveRange.rangeMin : skill.rangeMin,
      rangeMax: skill.useWeaponRange ? effectiveRange.rangeMax : skill.rangeMax
    };
  }

  function collectSkillTargets(unit, skill, originOverride) {
    const origin = originOverride || { x: unit.x, y: unit.y };
    const range = getSkillRange(skill, unit);

    return state.battle.units
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
        const distance = Math.abs(origin.x - candidatePosition.x) + Math.abs(origin.y - candidatePosition.y);
        return distance >= range.rangeMin && distance <= range.rangeMax;
      })
      .map((candidate) => candidate.id);
  }

  function collectSkillTiles(unit, skill, originOverride) {
    const origin = originOverride || { x: unit.x, y: unit.y };
    const range = getSkillRange(skill, unit);
    const tiles = [];

    for (let y = 0; y < state.battle.map.height; y += 1) {
      for (let x = 0; x < state.battle.map.width; x += 1) {
        const distance = Math.abs(origin.x - x) + Math.abs(origin.y - y);

        if (distance > 0 && distance <= range.rangeMax) {
          tiles.push({ x, y });
        }
      }
    }

    if (skill.targetType === "self") {
      return [{ x: origin.x, y: origin.y }];
    }

    if (range.rangeMin === 0) {
      tiles.unshift({ x: origin.x, y: origin.y });
    }

    return tiles;
  }

  function updatePendingSkillPreview(unit, originOverride) {
    if (!state.ui.pendingSkillId) {
      state.ui.skillTiles = [];
      state.ui.skillTargetIds = [];
      return;
    }

    const skill = getSkillById(unit, state.ui.pendingSkillId);

    if (!skill || !canUseSkillOnCurrentTerrain(unit, skill)) {
      state.ui.skillTiles = [];
      state.ui.skillTargetIds = [];
      return;
    }

    state.ui.skillTiles = collectSkillTiles(unit, skill, originOverride);
    state.ui.skillTargetIds = collectSkillTargets(unit, skill, originOverride);
  }

  function getCommittedMove(unitId) {
    if (state.ui.pendingMove && state.ui.pendingMove.unitId === unitId) {
      return state.ui.pendingMove;
    }

    const unit = getUnitById(unitId);
    return unit && unit.turnMoveCommit ? clone(unit.turnMoveCommit) : null;
  }

  function getMovePreview(unitId) {
    return state.ui.movePreview && state.ui.movePreview.unitId === unitId
      ? state.ui.movePreview
      : null;
  }

  function getRemainingMovement(unit) {
    const committedMove = getCommittedMove(unit.id);
    return Math.max(0, unit.mov - Number(committedMove ? committedMove.spentCost : 0));
  }

  function clearMovePreview() {
    state.ui.movePreview = null;
  }

  function refreshSelectionState(unit) {
    const committedMove = getCommittedMove(unit.id);
    const attackMode = !!state.ui.pendingAttack;
    const skillMode = !!state.ui.pendingSkillId;
    const remainingMovement = getRemainingMovement(unit);

    if (attackMode || skillMode) {
      state.ui.reachableTiles = [];
    } else if (unit.team === "ally" && state.battle.phase === "player" && !unit.acted && !committedMove && remainingMovement > 0) {
      const reachableTiles = buildReachableTiles(unit, true, remainingMovement).map((tile) => {
        const totalCost = tile.cost + Number(committedMove ? committedMove.spentCost : 0);
        return Object.assign({}, tile, {
          totalCost,
          remainingMovement: Math.max(0, unit.mov - totalCost)
        });
      });
      state.ui.reachableTiles = reachableTiles;
    } else if (unit.team === "enemy" && unit.alive) {
      state.ui.reachableTiles = buildReachableTiles(unit, true).map((tile) => Object.assign({}, tile, {
        totalCost: tile.cost,
        remainingMovement: Math.max(0, unit.mov - tile.cost)
      }));
    } else {
      state.ui.reachableTiles = committedMove
        ? [{ x: unit.x, y: unit.y, cost: 0, path: [], elevation: getTileElevation(unit.x, unit.y) }]
        : [];
    }

    if (unit.team === "ally" && state.battle.phase === "player" && !unit.acted && attackMode) {
      state.ui.attackTiles = collectAttackTilesFromPositions(unit, [{ x: unit.x, y: unit.y }], {
        ignoreMinRange: true
      });
      state.ui.attackableTargetIds = collectAttackableTargets(unit, { x: unit.x, y: unit.y });
    } else {
      state.ui.attackTiles = [];
      state.ui.attackableTargetIds = [];
    }

    updatePendingSkillPreview(unit);
  }

  function selectUnit(unitId) {
    const unit = getUnitById(unitId);

    if (!unit) {
      return;
    }

    if (state.ui.pendingMove && state.ui.pendingMove.unitId !== unit.id) {
      return;
    }

    if (state.ui.movePreview && state.ui.movePreview.unitId !== unit.id) {
      return;
    }

    state.ui.selectedUnitId = unit.id;
    state.ui.pendingAttack = false;
    state.ui.pendingSkillId = null;
    state.ui.activePanel = "unit";
    refreshSelectionState(unit);

    notify();
  }

  function canPlayerControl(unit) {
    return !!unit && unit.team === "ally" && unit.alive && !unit.acted && state.battle.phase === "player";
  }

  function findNextControllableAlly(currentUnitId) {
    if (!state.battle || !Array.isArray(state.battle.units) || !state.battle.units.length) {
      return null;
    }

    const units = state.battle.units;
    const currentIndex = units.findIndex((unit) => unit.id === currentUnitId);
    const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

    for (let offset = 0; offset < units.length; offset += 1) {
      const index = (startIndex + offset) % units.length;
      const candidate = units[index];

      if (canPlayerControl(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  function autoSelectNextControllableAlly(currentUnitId) {
    const nextUnit = findNextControllableAlly(currentUnitId);

    if (!nextUnit) {
      return false;
    }

    selectUnit(nextUnit.id);
    return true;
  }

  function previewMoveSelection(x, y) {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return;
    }

    if (getCommittedMove(unit.id)) {
      return;
    }

    const reachableTile = state.ui.reachableTiles.find((tile) => tile.x === x && tile.y === y) || null;
    const isReachable = !!reachableTile;

    if (!isReachable || (x === unit.x && y === unit.y)) {
      if (state.ui.movePreview && state.ui.movePreview.unitId === unit.id && x === unit.x && y === unit.y) {
        clearMovePreview();
        refreshSelectionState(unit);
        notify();
      }
      return;
    }

    state.ui.movePreview = {
      unitId: unit.id,
      from: { x: unit.x, y: unit.y },
      x,
      y,
      cost: reachableTile.cost,
      totalCost: Number(reachableTile.totalCost || reachableTile.cost || 0),
      remainingMovement: Number(reachableTile.remainingMovement || Math.max(0, unit.mov - reachableTile.cost)),
      path: clone(reachableTile.path || [])
    };

    state.ui.pendingAttack = false;
    state.ui.pendingSkillId = null;
    state.ui.attackTiles = [];
    state.ui.attackableTargetIds = [];
    state.ui.skillTiles = [];
    state.ui.skillTargetIds = [];
    notify();
  }

  function commitMovePreview() {
    if (!state.ui.movePreview) {
      return null;
    }

    const preview = state.ui.movePreview;
    const unit = getUnitById(preview.unitId);

    if (!canPlayerControl(unit)) {
      clearMovePreview();
      notify();
      return null;
    }

    const existingCommit = getCommittedMove(unit.id);
    const origin = existingCommit ? existingCommit.origin : { x: unit.x, y: unit.y };
    unit.x = preview.x;
    unit.y = preview.y;
    unit.movedThisTurn = true;
    const committedMove = {
      unitId: unit.id,
      origin,
      spentCost: preview.totalCost
    };
    unit.turnMoveCommit = clone(committedMove);
    state.ui.pendingMove = committedMove;
    clearMovePreview();
    triggerContactEncounter(unit, unit.x, unit.y);
    refreshSelectionState(unit);
    addLog(`${unit.name} 이동 확정: (${unit.x}, ${unit.y}) / 남은 이동 ${getRemainingMovement(unit)}`);
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
    return unit;
  }

  function cancelMovePreview() {
    const preview = state.ui.movePreview;

    if (!preview) {
      return;
    }

    const unit = getUnitById(preview.unitId);
    clearMovePreview();

    if (unit) {
      refreshSelectionState(unit);
    }

    notify();
  }

  function undoMove() {
    if (state.ui.movePreview && !state.ui.pendingMove) {
      cancelMovePreview();
      return;
    }

    if (!state.ui.pendingMove) {
      return;
    }

    const unit = getUnitById(state.ui.pendingMove.unitId);

    if (!unit) {
      return;
    }

    unit.x = state.ui.pendingMove.origin.x;
    unit.y = state.ui.pendingMove.origin.y;
    unit.movedThisTurn = false;
    unit.turnMoveCommit = null;
    state.ui.pendingMove = null;
    clearMovePreview();
    selectUnit(unit.id);
  }

  function finalizeUnitAction(unit) {
    unit.acted = true;
    unit.turnMoveCommit = null;
    state.ui.pendingMove = null;
    state.ui.movePreview = null;
    state.ui.pendingSkillId = null;
    state.ui.reachableTiles = [];
    state.ui.attackTiles = [];
    state.ui.attackableTargetIds = [];
    state.ui.skillTiles = [];
    state.ui.skillTargetIds = [];
    state.ui.selectedUnitId = null;
    syncPersistentFromBattle({ keepBattleState: true });
  }

  function handleUnitDefeat(unit) {
    unit.alive = false;
    unit.hp = 0;
    unit.acted = true;
    addLog(`${unit.name} 격파`);
    updateEndlessRunStat((currentRun) => {
      if (unit.team === "enemy") {
        currentRun.enemiesDefeated += 1;
      }

      if (unit.isElite) {
        currentRun.eliteDefeated += 1;
      }

      if (unit.isBoss) {
        currentRun.bossesDefeated += 1;
      }
    });
    grantBossFixedReward(unit);
    evaluateStageEvents("boss_defeated", { unit });
    updateRiftDefenseEnemyCount();
  }

  function maybeGrantLoot(defeatedUnit, attacker) {
    if (!defeatedUnit || defeatedUnit.team !== "enemy") {
      return null;
    }

    const guaranteed = !!defeatedUnit.isElite;
    const attackerDropBonus = attacker && attacker.hiddenStats ? Number(attacker.hiddenStats.dropRateBonus || 0) : 0;
    const attackerQualityBonus = attacker && attacker.hiddenStats ? Number(attacker.hiddenStats.lootQualityBonus || 0) : 0;
    const dropRate = defeatedUnit.isElite ? 1 : Math.min(0.97, 0.72 + attackerDropBonus);

    if (Math.random() > dropRate) {
      return null;
    }

    const item = InventoryService.createLootDrop(defeatedUnit.level + (defeatedUnit.rewardBias || 0), {
      qualityBias: attackerQualityBonus
    });
    InventoryService.addItemToInventory(state.saveData, item);
    state.battle.rewardHistory.push(item);
    updateEndlessRunStat((currentRun) => {
      currentRun.itemsLooted += 1;
    });
    addLog(`${guaranteed ? "정예 전리품 획득" : "아이템 획득"}: ${item.name} (${InventoryService.getRarityMeta(item.rarity).label})`);
    return item;
  }

  function applyLifeSteal(attacker, damageDealt, sourceLabel) {
    if (!attacker || !attacker.alive || damageDealt <= 0) {
      return 0;
    }

    const hidden = attacker.hiddenStats || {};
    const drainRate = Math.max(0, Math.min(0.5, Number(hidden.lifeStealPercent || 0)));

    if (!drainRate || attacker.hp >= attacker.maxHp) {
      return 0;
    }

    const healed = Math.min(
      Math.max(0, attacker.maxHp - attacker.hp),
      Math.max(1, Math.floor(damageDealt * drainRate))
    );

    if (healed <= 0) {
      return 0;
    }

    attacker.hp += healed;
    addLog(`${sourceLabel}: ${attacker.name} HP ${healed} 흡수`);
    return healed;
  }

  function getKillGoldReward(defeatedUnit, attacker) {
    if (!defeatedUnit || defeatedUnit.team !== "enemy" || !attacker || attacker.team !== "ally") {
      return 0;
    }

    const hidden = attacker.hiddenStats || {};
    const unitLevel = Math.max(1, Number(defeatedUnit.level || 1));
    const baseGold = defeatedUnit.isBoss
      ? 24 + unitLevel * 6
      : defeatedUnit.isElite
        ? 10 + unitLevel * 3
        : 2 + unitLevel * 2;
    const bonusRate = Math.max(0, Number(hidden.goldGainBonus || 0) + Number(hidden.monsterGoldBonus || 0));
    return Math.max(0, Math.round(baseGold * (1 + bonusRate)));
  }

  function applyOnKillRewards(defeatedUnit, attacker, sourceLabel) {
    if (!attacker || !attacker.alive) {
      return;
    }

    const hidden = attacker.hiddenStats || {};
    const killHeal = Math.max(0, Number(hidden.killHealFlat || 0));

    if (killHeal && attacker.hp < attacker.maxHp) {
      const healed = Math.min(killHeal, Math.max(0, attacker.maxHp - attacker.hp));

      if (healed > 0) {
        attacker.hp += healed;
        addLog(`${sourceLabel}: ${attacker.name} HP ${healed} 회복`);
      }
    }

    const goldReward = getKillGoldReward(defeatedUnit, attacker);

    if (goldReward > 0) {
      state.saveData.partyGold += goldReward;
      updateEndlessRunStat((currentRun) => {
        currentRun.goldEarned += goldReward;
      });
      addLog(`${sourceLabel}: ${goldReward}G 확보`);
    }
  }

  function resetTurnCombatFlags(unit) {
    if (!unit) {
      return;
    }

    unit.turnAttackCount = 0;
    unit.movedThisTurn = false;
    unit.usedSkillThisTurn = false;
    unit.turnMoveCommit = null;
  }

  function applyOnHitAilments(attacker, target, sourceLabel) {
    if (!attacker || !target || !attacker.hiddenStats || !target.alive) {
      return;
    }

    const attackerHidden = attacker.hiddenStats || {};
    const defenderHidden = target.hiddenStats || {};
    const resistChance = Math.max(0, Math.min(0.75, Number(defenderHidden.statusResistChance || 0)));
    const durationBonus = Math.round(Number(attackerHidden.statusDurationBonus || 0) * 2);
    const ailmentTemplates = [
      {
        id: "bleed",
        label: "출혈",
        chance: Number(attackerHidden.bleedChance || 0),
        effect: {
          id: "bleed",
          kind: "ailment",
          name: "출혈",
          remainingOwnPhases: 2 + durationBonus,
          tickDamagePercent: 0.08
        }
      },
      {
        id: "burn",
        label: "화상",
        chance: Number(attackerHidden.burnChance || 0),
        effect: {
          id: "burn",
          kind: "ailment",
          name: "화상",
          remainingOwnPhases: 2 + durationBonus,
          tickDamagePercent: 0.06,
          defenseBonus: -1
        }
      },
      {
        id: "poison",
        label: "중독",
        chance: Number(attackerHidden.poisonChance || 0),
        effect: {
          id: "poison",
          kind: "ailment",
          name: "중독",
          remainingOwnPhases: 3 + durationBonus,
          tickDamagePercent: 0.05,
          hitBonus: -6
        }
      },
      {
        id: "freeze",
        label: "빙결",
        chance: Number(attackerHidden.freezeChance || 0),
        effect: {
          id: "freeze",
          kind: "ailment",
          name: "빙결",
          remainingOwnPhases: 1 + Math.min(1, durationBonus),
          defenseBonus: -1,
          avoidBonus: -10
        }
      }
    ];

    ailmentTemplates.forEach((template) => {
      const finalChance = Math.max(0, template.chance - resistChance);

      if (finalChance <= 0 || Math.random() > finalChance) {
        return;
      }

      target.statusEffects = (target.statusEffects || []).filter((effect) => effect.id !== template.id);
      const nextEffect = Object.assign({}, template.effect, { sourceUnitId: attacker.id });
      target.statusEffects.push(nextEffect);
      addLog(`${sourceLabel}: ${target.name} ${template.label} 부여`);
    });
  }

  function decrementTeamEffects(team) {
    state.battle.units.forEach((unit) => {
      if (unit.team !== team || !unit.alive) {
        return;
      }

      Object.keys(unit.skillCooldowns || {}).forEach((skillId) => {
        unit.skillCooldowns[skillId] = Math.max(0, unit.skillCooldowns[skillId] - 1);

        if (unit.skillCooldowns[skillId] === 0) {
          delete unit.skillCooldowns[skillId];
        }
      });

      unit.statusEffects = (unit.statusEffects || []).filter((effect) => {
        if (effect && effect.kind === "ailment") {
          const tickDamage = Math.max(0, Math.floor(unit.maxHp * Number(effect.tickDamagePercent || 0)) + Number(effect.tickDamageFlat || 0));

          if (tickDamage > 0) {
            unit.hp = Math.max(0, unit.hp - tickDamage);
            addLog(`${unit.name} ${effect.name} 피해 ${tickDamage}`);

            if (unit.hp <= 0) {
              const sourceUnit = effect.sourceUnitId ? getUnitById(effect.sourceUnitId) : null;
              handleUnitDefeat(unit);
              applyOnKillRewards(unit, sourceUnit, "지속 피해 마무리");
              maybeGrantLoot(unit, sourceUnit);
              return false;
            }
          }
        }

        if (typeof effect.remainingOwnPhases !== "number") {
          return true;
        }

        effect.remainingOwnPhases -= 1;
        return effect.remainingOwnPhases > 0;
      });
    });
  }

  function applyExperience(attacker, amount) {
    if (attacker.team !== "ally") {
      return;
    }

    attacker.exp += amount;

    while (attacker.exp >= 100) {
      const previousLevel = attacker.level;
      attacker.exp -= 100;
      attacker.level += 1;
      const gains = StatsService.rollLevelGains(attacker, 5);
      StatsService.applyLevelGains(attacker, gains);
      attacker.statPoints = (attacker.statPoints || 0) + 1;
      attacker.skillPoints = (attacker.skillPoints || 0) + 1;
      addLog(
        `${attacker.name} 레벨 업! Lv.${attacker.level} / 성장: ${StatsService.describeLevelGains(gains)}`
      );
      addLog(`${attacker.name} 스탯 포인트 +1 / 스킬 포인트 +1`);

      SkillsService.grantMilestoneRewardsForLevel(attacker, previousLevel, attacker.level).forEach((skill) => {
        addLog(`${attacker.name} 병종 적성 각성: ${skill.name}`);
      });

      SkillsService.getNewlyUnlockedSkills(attacker.className, previousLevel, attacker.level).forEach((skill) => {
        addLog(`${attacker.name} 학습 가능 스킬: ${skill.name}`);
      });

      SkillsService.getNewlyUnlockedActiveSkills(attacker.className, previousLevel, attacker.level).forEach((skill) => {
        addLog(`${attacker.name} 학습 가능 액티브: ${skill.name}`);
      });

      SkillsService.getPromotionOptions(attacker)
        .filter((promotion) => promotion.unlockLevel > previousLevel && promotion.unlockLevel <= attacker.level)
        .forEach((promotion) => {
          addLog(`${attacker.name} 전직 가능: ${promotion.className}`);
        });
    }
  }

  function calculateStageClearExpReward() {
    if (!state.battle) {
      return 0;
    }

    if (state.battle.stageId === ENDLESS_STAGE_ID) {
      const floor = Math.max(1, Number(state.battle.endlessFloor || 1));
      return 18 + floor * 4;
    }

    const rewardGold = Math.max(0, Number(state.battle.rewardGold || 0));
    return Math.max(20, Math.round(rewardGold * 0.24));
  }

  function grantStageClearExperience() {
    const rewardExp = calculateStageClearExpReward();

    if (rewardExp <= 0 || !state.battle) {
      return 0;
    }

    state.battle.units
      .filter((unit) => unit.team === "ally")
      .forEach((unit) => {
        applyExperience(unit, rewardExp);
        addLog(`${unit.name} 스테이지 클리어 경험치 +${rewardExp}`);
      });

    return rewardExp;
  }

  function setSkillCooldown(unit, skill) {
    unit.skillCooldowns = unit.skillCooldowns || {};
    const reduction = Math.max(0, Number(unit.hiddenStats && unit.hiddenStats.cooldownReduction || 0));
    unit.skillCooldowns[skill.id] = Math.max(0, Number(skill.cooldown || 0) - reduction);
  }

  function hasStatusEffect(unit, effectId) {
    return (unit.statusEffects || []).some((effect) => effect.id === effectId);
  }

  function executeSkill(unit, skill, target) {
    if (!skill || !target) {
      return null;
    }

    const currentCooldown = (unit.skillCooldowns && unit.skillCooldowns[skill.id]) || 0;

    if (currentCooldown > 0) {
      throw new Error(`이 스킬은 ${currentCooldown}턴 후 다시 사용할 수 있습니다.`);
    }

    const validTargets = collectSkillTargets(unit, skill);

    if (!validTargets.includes(target.id)) {
      throw new Error("현재 위치에서는 이 대상에게 스킬을 사용할 수 없습니다.");
    }

    let result = null;
    const performance = SkillsService.getSkillPerformance(unit, skill);

    if (skill.effect.kind === "heal") {
      const missingHp = target.maxHp - target.hp;

      if (missingHp <= 0) {
        throw new Error("대상의 HP가 이미 최대입니다.");
      }

      const healed = Math.min(
        performance && performance.kind === "heal" ? performance.amount : skill.effect.amount,
        missingHp
      );
      target.hp += healed;
      result = { type: "heal", healed };
      addLog(`${unit.name}의 ${skill.name}: ${target.name} HP ${healed} 회복`);
    }

    if (skill.effect.kind === "buff") {
      const nextBuff = clone(skill.effect.buff || {});

      if (performance && performance.kind === "buff") {
        performance.entries.forEach((entry) => {
          nextBuff[entry.key] = entry.value;
        });
      }

      target.statusEffects = target.statusEffects || [];
      target.statusEffects = target.statusEffects.filter((effect) => effect.id !== skill.effect.buff.id);
      target.statusEffects.push(nextBuff);
      result = { type: "buff" };
      addLog(`${unit.name}의 ${skill.name}: ${target.name}에게 ${nextBuff.name} 부여`);
    }

    if (skill.effect.kind === "attack") {
      const preview = CombatService.calculatePreview(unit, target, {
        attackerTileType: getTileType(unit.x, unit.y),
        defenderTileType: getTileType(target.x, target.y),
        attackerElevation: getTileElevation(unit.x, unit.y),
        defenderElevation: getTileElevation(target.x, target.y),
        phase: state.battle.phase,
        damageType: skill.effect.damageType || null
      });

      if (!preview.canAttack) {
        throw new Error("현재 무기로는 이 스킬을 사용할 수 없습니다.");
      }

      const skillHitBonus = performance && performance.kind === "attack"
        ? performance.hitBonus
        : (skill.effect.hitBonus || 0);
      const skillDamageBonus = performance && performance.kind === "attack"
        ? performance.damageBonus
        : (skill.effect.damageBonus || 0);
      const hitRate = Math.max(5, Math.min(100, preview.hitRate + skillHitBonus));
      const damage = Math.max(0, preview.damage + skillDamageBonus);
      const roll = Math.floor(Math.random() * 100) + 1;
      const didHit = roll <= hitRate;
      const critRoll = Math.floor(Math.random() * 100) + 1;
      const critRate = preview.critRate || 0;
      const didCrit = didHit && critRoll <= critRate;
      const finalDamage = didCrit ? Math.max(damage, Math.round(damage * (preview.critMultiplier || 1.5))) : damage;

      if (Math.random() <= ACTION_DURABILITY_CONSUME_CHANCE) {
        unit.weapon.uses = Math.max(0, unit.weapon.uses - 1);
      }

      if (didHit) {
        target.hp = Math.max(0, target.hp - finalDamage);
        addLog(`${unit.name}의 ${skill.name}: ${target.name}에게 ${finalDamage} 피해${didCrit ? " / 치명타!" : ""}`);
        applyOnHitAilments(unit, target, `${unit.name}의 ${skill.name}`);
        applyLifeSteal(unit, finalDamage, `${skill.name} 흡혈`);
        if (preview.elevationNote) {
          addLog(`지형 보정: ${preview.elevationNote}`);
        }
        updateEndlessRunStat((currentRun) => {
          if (unit.team === "ally") {
            currentRun.damageDealt += finalDamage;
          } else {
            currentRun.damageTaken += finalDamage;
          }
        });
      } else {
        addLog(`${unit.name}의 ${skill.name}이 빗나갔습니다.`);
      }

      if (didHit && target.hp <= 0) {
        handleUnitDefeat(target);
        applyOnKillRewards(target, unit, `${skill.name} 처치 보상`);
        maybeGrantLoot(target, unit);
      }

      applyExperience(unit, didHit ? (target.hp <= 0 ? 40 : 14) : 5);
      unit.turnAttackCount = Number(unit.turnAttackCount || 0) + 1;
      unit.usedSkillThisTurn = true;
      result = { type: "attack", didHit, didCrit, damage: finalDamage };
    }

    evaluateStageEvents("boss_hp_half");
    setSkillCooldown(unit, skill);
    finalizeUnitAction(unit);
    return result;
  }

  function setPendingSkill(skillId) {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return;
    }

    if (getMovePreview(unit.id)) {
      throw new Error("이동 미리보기를 먼저 확정하거나 취소하세요.");
    }

    const skill = getSkillById(unit, skillId);

    if (!skill) {
      return;
    }

    if (skill.cooldownRemaining > 0) {
      throw new Error(`이 스킬은 ${skill.cooldownRemaining}턴 후 다시 사용할 수 있습니다.`);
    }

    if (!canUseSkillOnCurrentTerrain(unit, skill)) {
      throw new Error("현재 지형에서는 이 스킬을 사용할 수 없습니다.");
    }

    state.ui.pendingAttack = false;
    state.ui.pendingSkillId = skill.id;
    state.ui.reachableTiles = [];
    state.ui.attackTiles = [];
    state.ui.attackableTargetIds = [];
    clearMovePreview();
    state.ui.skillTiles = collectSkillTiles(unit, skill);
    state.ui.skillTargetIds = collectSkillTargets(unit, skill);

    if (skill.targetType === "self") {
      useSkill(skill.id, unit.id);
      return;
    }

    notify();
  }

  function cancelPendingSkill() {
    if (!state.ui.pendingSkillId) {
      return;
    }

    const unit = getUnitById(state.ui.selectedUnitId);
    state.ui.pendingSkillId = null;
    state.ui.skillTiles = [];
    state.ui.skillTargetIds = [];

    if (unit) {
      refreshSelectionState(unit);
    }

    notify();
  }

  function useSkill(skillId, targetId) {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return null;
    }

    if (getMovePreview(unit.id)) {
      throw new Error("이동 미리보기를 먼저 확정하거나 취소하세요.");
    }

    const skill = getSkillById(unit, skillId);
    const target = getUnitById(targetId);

    if (!skill || !target) {
      return null;
    }

    if (skill.cooldownRemaining > 0) {
      throw new Error(`이 스킬은 ${skill.cooldownRemaining}턴 후 다시 사용할 수 있습니다.`);
    }

    if (!canUseSkillOnCurrentTerrain(unit, skill)) {
      throw new Error("현재 지형에서는 이 스킬을 사용할 수 없습니다.");
    }
    const result = executeSkill(unit, skill, target);

    if (checkBattleEnd()) {
      finishBattlePersistence();
      notify();
      return result;
    }

    if (autoSelectNextControllableAlly(unit.id)) {
      return result;
    }

    notify();
    return result;
  }

  function setPendingAttack() {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return;
    }

    if (getMovePreview(unit.id)) {
      throw new Error("이동 미리보기를 먼저 확정하거나 취소하세요.");
    }

    if (!unit.weapon || unit.weapon.uses <= 0) {
      throw new Error("사용 가능한 무기가 없습니다.");
    }

    state.ui.pendingSkillId = null;
    state.ui.pendingAttack = !state.ui.pendingAttack;
    refreshSelectionState(unit);
    notify();
  }

  function checkBattleEnd() {
    const leaderId = state.saveData ? state.saveData.leaderUnitId : null;
    const leaderUnit = leaderId ? getUnitById(leaderId) : null;
    const allAlliesDead = getAliveUnitsByTeam("ally").length === 0;
    const bossUnit = getBossUnit();
    const allEnemiesDead = getAliveUnitsByTeam("enemy").length === 0;
    const bossDefeated = !bossUnit || !bossUnit.alive;
    const defenseState = state.battle.defenseState;
    const defenseObjectiveBroken = isRiftDefenseBattle(state.battle) && defenseState
      ? Number(defenseState.objectiveHp || 0) <= 0
      : false;
    const defeatMet = state.battle.defeatCondition === "all_allies_down"
      ? allAlliesDead
      : state.battle.defeatCondition === "objective_or_all_allies_down"
        ? (allAlliesDead || defenseObjectiveBroken)
        : (leaderUnit ? !leaderUnit.alive : allAlliesDead);
    const victoryMet = isRiftDefenseBattle(state.battle)
      ? (
          allEnemiesDead
          && defenseState
          && Number(defenseState.waveIndex || 1) >= Number(defenseState.totalWaves || 0)
          && Number(defenseState.objectiveHp || 0) > 0
        )
      : state.battle.victoryCondition === "support_complete"
        ? false
        : state.battle.victoryCondition === "boss_defeat"
          ? bossDefeated
          : state.battle.victoryCondition === "boss_or_route"
            ? (bossDefeated || allEnemiesDead)
            : allEnemiesDead;

    if (isRiftDefenseBattle(state.battle) && defenseState) {
      updateRiftDefenseEnemyCount();

      if (!defeatMet && allEnemiesDead && Number(defenseState.waveIndex || 1) < Number(defenseState.totalWaves || 0)) {
        beginNextRiftDefenseWave();
        syncPersistentFromBattle({ keepBattleState: true });
        return false;
      }
    }

    if (defeatMet) {
      if (defenseState) {
        defenseState.battleResolved = true;
      }

      state.battle.status = "defeat";
      applyRiftDefenseRewards();
      state.saveData.battleState = null;
      resetUiState();
      markCampaignDefeat();
      addLog(state.battle.defeatCondition === "all_allies_down"
        ? "아군이 전멸했습니다. 패배했습니다."
        : state.battle.defeatCondition === "objective_or_all_allies_down"
          ? defenseObjectiveBroken
            ? "거점이 붕괴했습니다. 방어전에 실패했습니다."
            : "아군이 전멸했습니다. 방어전에 실패했습니다."
          : "리더가 쓰러졌습니다. 패배했습니다.");
      return true;
    }

    if (victoryMet) {
      if (state.battle.floorType === "event" && state.battle.deferredChoice && !state.battle.pendingChoice) {
        state.battle.victoryCondition = "support_complete";
        state.battle.pendingChoice = clone(state.battle.deferredChoice);
        state.battle.deferredChoice = null;
        state.battle.phase = "player";
        resetUiState();
        addLog("적을 정리했습니다. 균열 사건을 선택하세요.");
        state.battle.lastEventText = "전투가 끝난 뒤 균열 사건이 모습을 드러냈다.";
        syncPersistentFromBattle({ keepBattleState: true });
        return false;
      }

      state.battle.status = "victory";
      if (defenseState) {
        defenseState.battleResolved = true;
      }
      state.saveData.battleState = null;
      resetUiState();
      applyStageRewards();
      advanceCampaignOnVictory();
      addLog(isRiftDefenseBattle(state.battle)
        ? "최종 웨이브를 막아냈습니다. 균열 봉쇄에 성공했습니다."
        : "모든 적을 쓰러뜨렸습니다. 승리했습니다.");
      return true;
    }

    return false;
  }

  function finishBattlePersistence() {
    updatePersistentUnitsFromBattle();
    const allySpawns = state.battle.allySpawns || ALLY_SPAWNS;

    (state.saveData.roster || []).forEach((unit) => {
      const selectedIndex = (state.saveData.selectedPartyIds || []).indexOf(unit.id);
      const spawn = selectedIndex >= 0
        ? (allySpawns[selectedIndex] || allySpawns[allySpawns.length - 1])
        : null;
      unit.hp = unit.maxHp;
      unit.alive = true;
      unit.acted = false;

      if (spawn) {
        unit.x = spawn.x;
        unit.y = spawn.y;
      }
    });

    state.saveData.phase = "player";
    state.saveData.turnNumber = 1;
  }

  function formatRewardHistoryItemName(item) {
    if (!item) {
      return "";
    }

    if (InventoryService.isMisc(item)) {
      return `${item.name} x${Math.max(0, Number(item.quantity || 0))}`;
    }

    return item.name;
  }

  function grantRefineStoneStageReward() {
    const currentStage = getCurrentStageDefinition();
    const isEndless = state.battle && state.battle.stageId === ENDLESS_STAGE_ID;
    const baseChance = isEndless
      ? 0.58
      : currentStage && currentStage.boss
        ? 0.46
        : 0.28;

    if (Math.random() > baseChance) {
      return null;
    }

    const quantity = isEndless
      ? (Math.random() < 0.28 ? 2 : 1)
      : currentStage && currentStage.boss
        ? (Math.random() < 0.22 ? 2 : 1)
        : 1;
    const item = InventoryService.createMiscItemStack("refine-stone-basic", quantity);

    InventoryService.addItemToInventory(state.saveData, item);
    state.battle.rewardHistory.push(item);
    addLog(`전투 보상: 재련석 ${quantity}개 확보`);

    return item;
  }

  function applyStageRewards() {
    const campaign = ensureCampaignState();
    const endless = ensureEndlessState();

    if (isRiftDefenseBattle(state.battle)) {
      applyRiftDefenseRewards();
      const defenseGrade = getRiftDefenseGradeFromBattle(state.battle);
      const defenseState = state.battle.defenseState || {};
      const rewardItems = (state.battle.rewardHistory || []).map((item) => formatRewardHistoryItemName(item));

      campaign.lastResult = {
        stageId: state.battle.stageId,
        stageName: state.battle.stageName,
        result: state.battle.status,
        rewardGold: Number(state.battle.rewardGold || 0),
        rewardExp: Number(state.battle.rewardExp || 0),
        rewardItems,
        recruitedUnits: [],
        endlessFloor: null,
        defenseWave: Number(defenseState.waveIndex || 1),
        defenseGrade,
        defenseObjectiveHp: Number(defenseState.objectiveHp || 0),
        defenseObjectiveMaxHp: Number(defenseState.objectiveMaxHp || 0),
        clearedAt: new Date().toISOString()
      };
      return;
    }

    const rewardGold = state.battle.rewardGold || 0;
    const rewardExp = grantStageClearExperience();
    grantRefineStoneStageReward();
    const rewardItems = (state.battle.rewardHistory || []).map((item) => formatRewardHistoryItemName(item));
    const recruitedUnits = grantRecruitRewards(state.battle.stageId);

    state.saveData.partyGold += rewardGold;
    updateEndlessRunStat((currentRun) => {
      currentRun.goldEarned += rewardGold;
    });
    campaign.lastResult = {
      stageId: state.battle.stageId,
      stageName: state.battle.stageName,
      result: state.battle.status,
      rewardGold,
      rewardExp,
      rewardItems,
      recruitedUnits,
      endlessFloor: state.battle.stageId === ENDLESS_STAGE_ID ? endless.currentFloor : null,
      clearedAt: new Date().toISOString()
    };
  }

  function advanceCampaignOnVictory() {
    const campaign = ensureCampaignState();
    const endless = ensureEndlessState();
    const currentStage = getCurrentStageDefinition();

    if (currentStage.id === RIFT_DEFENSE_STAGE_ID) {
      const defenseProgress = ensureRiftDefenseState();
      const defenseState = state.battle.defenseState || {};
      const defenseGrade = getRiftDefenseGradeFromBattle(state.battle);
      defenseProgress.bestWave = Math.max(defenseProgress.bestWave, Number(defenseState.waveIndex || 1));
      defenseProgress.clears += 1;
      defenseProgress.highestObjectiveHp = Math.max(defenseProgress.highestObjectiveHp, Number(defenseState.objectiveHp || 0));
      defenseProgress.lastReachedWave = Number(defenseState.waveIndex || 1);
      defenseProgress.lastGrade = defenseGrade;

      if (!defenseProgress.bestGrade || compareDefenseGrades(defenseGrade, defenseProgress.bestGrade) < 0) {
        defenseProgress.bestGrade = defenseGrade;
      }

      state.saveData.stageId = RIFT_DEFENSE_STAGE_ID;
      state.saveData.stageStatus = "ready";
      return;
    }

    if (currentStage.id === ENDLESS_STAGE_ID) {
      endless.bestFloor = Math.max(endless.bestFloor, endless.currentFloor);
      updateEndlessRunStat((currentRun) => {
        currentRun.floorsCleared += 1;
        currentRun.battlesWon += 1;
        currentRun.highestFloor = Math.max(currentRun.highestFloor || endless.currentFloor, endless.currentFloor + 1);
      });
      recordEndlessRun("victory");
      endless.currentFloor += 1;
      endless.bestFloor = Math.max(endless.bestFloor, endless.currentFloor);
      state.saveData.stageId = ENDLESS_STAGE_ID;
      state.saveData.stageStatus = "ready";
      return;
    }

    if (!campaign.clearedStageIds.includes(currentStage.id)) {
      campaign.clearedStageIds.push(currentStage.id);
    }

    if (NON_REPEATABLE_STAGE_IDS.has(currentStage.id)) {
      campaign.availableStageIds = (campaign.availableStageIds || []).filter((stageId) => stageId !== currentStage.id);
    }

    const nextIndex = Math.min(STAGE_DEFINITIONS.length - 1, (campaign.currentStageIndex || 0) + 1);
    campaign.currentStageIndex = nextIndex;

    const nextStage = STAGE_DEFINITIONS[nextIndex];

    if (nextStage && !campaign.availableStageIds.includes(nextStage.id)) {
      campaign.availableStageIds.push(nextStage.id);
    }

    state.saveData.stageId = nextStage ? nextStage.id : currentStage.id;
    state.saveData.stageStatus = "ready";
  }

  function markCampaignDefeat() {
    const campaign = ensureCampaignState();
    const endless = ensureEndlessState();
    const currentStage = getCurrentStageDefinition();
    const defenseState = state.battle && state.battle.defenseState ? state.battle.defenseState : null;
    const defenseGrade = isRiftDefenseBattle(state.battle) ? getRiftDefenseGradeFromBattle(state.battle) : null;

    if (currentStage.id === RIFT_DEFENSE_STAGE_ID) {
      const defenseProgress = ensureRiftDefenseState();
      defenseProgress.bestWave = Math.max(defenseProgress.bestWave, Number(defenseState && defenseState.waveIndex || 1));
      defenseProgress.highestObjectiveHp = Math.max(
        defenseProgress.highestObjectiveHp,
        Number(defenseState && defenseState.objectiveHp || 0)
      );
      defenseProgress.lastReachedWave = Number(defenseState && defenseState.waveIndex || 1);
      defenseProgress.lastGrade = defenseGrade;

      if (defenseGrade && (!defenseProgress.bestGrade || compareDefenseGrades(defenseGrade, defenseProgress.bestGrade) < 0)) {
        defenseProgress.bestGrade = defenseGrade;
      }
    }

    campaign.lastResult = {
      stageId: currentStage.id,
      stageName: currentStage.name,
      result: "defeat",
      rewardGold: currentStage.id === RIFT_DEFENSE_STAGE_ID ? Number(state.battle && state.battle.rewardGold || 0) : 0,
      rewardExp: currentStage.id === RIFT_DEFENSE_STAGE_ID ? Number(state.battle && state.battle.rewardExp || 0) : 0,
      rewardItems: currentStage.id === RIFT_DEFENSE_STAGE_ID
        ? (state.battle && state.battle.rewardHistory || []).map((item) => formatRewardHistoryItemName(item))
        : [],
      endlessFloor: currentStage.id === ENDLESS_STAGE_ID ? endless.currentFloor : null,
      defenseWave: currentStage.id === RIFT_DEFENSE_STAGE_ID ? Number(defenseState && defenseState.waveIndex || 1) : null,
      defenseGrade,
      defenseObjectiveHp: currentStage.id === RIFT_DEFENSE_STAGE_ID ? Number(defenseState && defenseState.objectiveHp || 0) : null,
      defenseObjectiveMaxHp: currentStage.id === RIFT_DEFENSE_STAGE_ID ? Number(defenseState && defenseState.objectiveMaxHp || 0) : null,
      clearedAt: new Date().toISOString()
    };

    if (currentStage.id === ENDLESS_STAGE_ID) {
      endless.bestFloor = Math.max(endless.bestFloor, endless.currentFloor);
      recordEndlessRun("defeat");
      endless.currentFloor = 1;
      endless.relicIds = [];
      endless.currentRun = null;
    }

    state.saveData.stageId = currentStage.id;
    state.saveData.stageStatus = "ready";
  }

  function getVictoryConditionLabel(victoryCondition) {
    if (victoryCondition === "support_complete") {
      return "정비 후 이동";
    }

    if (victoryCondition === "defense_hold") {
      return "5개 웨이브 방어";
    }

    if (victoryCondition === "boss_defeat") {
      return "보스 격파";
    }

    if (victoryCondition === "boss_or_route") {
      return "보스 격파 또는 적 전멸";
    }

    return "적 전멸";
  }

  function isEndlessUnlocked(saveData) {
    const campaign = saveData && saveData.campaign
      ? saveData.campaign
      : {
          clearedStageIds: []
        };

    return STAGE_DEFINITIONS.every((stage) => (campaign.clearedStageIds || []).includes(stage.id));
  }

  function isStageReplayLocked(saveData, stageId) {
    if (!NON_REPEATABLE_STAGE_IDS.has(stageId)) {
      return false;
    }

    const campaign = saveData && saveData.campaign
      ? saveData.campaign
      : {
          clearedStageIds: []
        };
    const cleared = (campaign.clearedStageIds || []).includes(stageId);
    const inProgress = saveData
      && saveData.stageStatus === "in_progress"
      && saveData.stageId === stageId
      && !!saveData.battleState;

    return cleared && !inProgress;
  }

  function getStageCatalog(saveData) {
    const campaign = saveData && saveData.campaign
      ? saveData.campaign
      : {
          currentStageIndex: 0,
          clearedStageIds: [],
          availableStageIds: [STAGE_DEFINITIONS[0].id]
        };
    const endless = saveData && saveData.endless
      ? saveData.endless
      : {
          currentFloor: 1,
          bestFloor: 1
        };
    const defenseProgress = saveData && saveData.riftDefense
      ? saveData.riftDefense
      : {
          bestWave: 0,
          bestGrade: null,
          clears: 0
        };
    const endlessUnlocked = isEndlessUnlocked(saveData);

    return STAGE_DEFINITIONS.map((stage, index) => {
      const replayLocked = isStageReplayLocked(saveData, stage.id);
      const inProgress = saveData && saveData.stageStatus === "in_progress" && saveData.stageId === stage.id;

      return ({
      id: stage.id,
      name: stage.name,
      objective: stage.objective,
      rewardGold: stage.rewardGold,
      category: "tutorial",
      victoryCondition: stage.victoryCondition || "route_enemy",
      victoryLabel: getVictoryConditionLabel(stage.victoryCondition || "route_enemy"),
      available: !replayLocked && (campaign.availableStageIds || []).includes(stage.id),
      cleared: (campaign.clearedStageIds || []).includes(stage.id),
      selected: saveData ? (saveData.stageId === stage.id && (!replayLocked || inProgress)) : (campaign.currentStageIndex || 0) === index,
      inProgress,
      order: index + 1
    });
    }).concat([
      {
        id: ENDLESS_STAGE_ID,
        name: `${ENDLESS_STAGE_META.name} ${endless.currentFloor}층`,
        objective: "층마다 랜덤 지형과 적 배치가 생성된다.",
        rewardGold: 120 + endless.currentFloor * 35,
        category: "main",
        victoryCondition: "variable",
        victoryLabel: `현재 ${endless.currentFloor}층 / 최고 ${endless.bestFloor}층`,
        available: endlessUnlocked,
        cleared: false,
        selected: saveData ? saveData.stageId === ENDLESS_STAGE_ID && endlessUnlocked : false,
        inProgress: saveData && saveData.stageStatus === "in_progress" && saveData.stageId === ENDLESS_STAGE_ID,
        order: STAGE_DEFINITIONS.length + 1,
        hidden: !endlessUnlocked
      },
      {
        id: RIFT_DEFENSE_STAGE_ID,
        name: RIFT_DEFENSE_STAGE_META.name,
        objective: "거점을 지키며 5개 웨이브를 버틴다.",
        rewardGold: RIFT_DEFENSE_WAVES.reduce((sum, wave) => sum + Number(wave.reward && wave.reward.gold || 0), 0) + 70,
        category: "main",
        contentMode: "rift-defense",
        victoryCondition: "defense_hold",
        victoryLabel: defenseProgress.bestWave > 0
          ? `최고 ${defenseProgress.bestWave}웨이브 / 등급 ${defenseProgress.bestGrade || "없음"}`
          : "5개 웨이브 방어",
        available: endlessUnlocked,
        cleared: Number(defenseProgress.clears || 0) > 0,
        selected: saveData ? saveData.stageId === RIFT_DEFENSE_STAGE_ID && endlessUnlocked : false,
        inProgress: saveData && saveData.stageStatus === "in_progress" && saveData.stageId === RIFT_DEFENSE_STAGE_ID,
        order: STAGE_DEFINITIONS.length + 2,
        hidden: !endlessUnlocked,
        description: "짧고 밀도 높은 방어전. 거점 HP와 포지셔닝이 핵심이다.",
        focusLines: [
          "현재 단계: 일반 봉쇄",
          `최고 도달 웨이브: ${defenseProgress.bestWave > 0 ? `${defenseProgress.bestWave} / ${RIFT_DEFENSE_WAVES.length}` : "기록 없음"}`,
          `최고 방어 등급: ${defenseProgress.bestGrade || "기록 없음"}`,
          "핵심 보상: 골드, 재련석, 최종 클리어 장비 1개"
        ]
      }
    ]);
  }

  function getRewardCodex(saveData) {
    const discoveredRewardIds = (
      (saveData && saveData.collection && saveData.collection.discoveredRewardIds) ||
      []
    );
    const inventory = (saveData && saveData.inventory) || [];

    return STAGE_DEFINITIONS
      .filter((stage) => stage.boss && stage.boss.fixedDrop)
      .map((stage) => {
        const reward = stage.boss.fixedDrop;
        const discovered =
          discoveredRewardIds.includes(reward.idPrefix) ||
          inventory.some((item) => String(item.id || "").startsWith(reward.idPrefix));

        return {
          stageId: stage.id,
          stageName: stage.name,
          bossName: stage.boss.name,
          rewardName: reward.name,
          rewardType: reward.type || reward.slot,
          rewardRarity: reward.rarity,
          rewardDescription: InventoryService.describeItem(reward),
          discovered
        };
      });
  }

  function getEndlessRelics(saveData) {
    const endless = saveData && saveData.endless
      ? saveData.endless
      : {
          relicIds: []
        };

    return (endless.relicIds || [])
      .map((relicId) => ENDLESS_RELICS[relicId])
      .filter(Boolean)
      .map((relic) => ({
        id: relic.id,
        name: relic.name,
        description: relic.description
      }));
  }

  function recordEndlessRun(result) {
    const endless = ensureEndlessState();
    const currentRun = endless.currentRun || buildEndlessRunState();

    endless.lastRun = {
      result,
      floor: endless.currentFloor,
      bestFloor: endless.bestFloor,
      relicNames: (endless.relicIds || [])
        .map((relicId) => ENDLESS_RELICS[relicId])
        .filter(Boolean)
        .map((relic) => relic.name),
      rewardItems: (state.battle && state.battle.rewardHistory || []).map((item) => formatRewardHistoryItemName(item)),
      stats: {
        floorStart: currentRun.floorStart,
        highestFloor: Math.max(currentRun.highestFloor || endless.currentFloor, endless.currentFloor),
        floorsCleared: currentRun.floorsCleared || 0,
        battlesWon: currentRun.battlesWon || 0,
        enemiesDefeated: currentRun.enemiesDefeated || 0,
        eliteDefeated: currentRun.eliteDefeated || 0,
        bossesDefeated: currentRun.bossesDefeated || 0,
        relicsCollected: currentRun.relicsCollected || 0,
        goldEarned: currentRun.goldEarned || 0,
        itemsLooted: currentRun.itemsLooted || 0,
        purchases: currentRun.purchases || 0,
        damageDealt: currentRun.damageDealt || 0,
        damageTaken: currentRun.damageTaken || 0
      },
      recordedAt: new Date().toISOString()
    };
  }

  function selectCampaignStage(saveData, stageId, options) {
    if (stageId === ENDLESS_STAGE_ID) {
      if (!isEndlessUnlocked(saveData)) {
        throw new Error("무한 균열은 프롤로그를 모두 클리어한 뒤 개방됩니다.");
      }

      const isChangingFromActiveBattle =
        saveData.stageStatus === "in_progress" &&
        saveData.battleState &&
        saveData.stageId !== stageId;

      if (isChangingFromActiveBattle && !(options && options.abandonCurrentBattle)) {
        throw new Error("진행 중인 전투가 있어 다른 스테이지로 변경할 수 없습니다.");
      }

      if (isChangingFromActiveBattle) {
        saveData.battleState = null;
        saveData.stageStatus = "ready";
        saveData.phase = "player";
        saveData.turnNumber = 1;
      }

      saveData.campaign = saveData.campaign || {
        currentStageIndex: 0,
        clearedStageIds: [],
        availableStageIds: [STAGE_DEFINITIONS[0].id],
        lastResult: null
      };
      saveData.endless = saveData.endless || {
        currentFloor: 1,
        bestFloor: 1
      };
      saveData.endless.currentFloor = Math.max(1, Number(saveData.endless.currentFloor || 1));
      saveData.endless.bestFloor = Math.max(saveData.endless.currentFloor, Number(saveData.endless.bestFloor || 1));
      saveData.stageId = ENDLESS_STAGE_ID;

      if (saveData.stageStatus !== "in_progress") {
        saveData.stageStatus = "ready";
        saveData.battleState = null;
        saveData.phase = "player";
        saveData.turnNumber = 1;
      }

      return buildEndlessStageDefinition(saveData.endless.currentFloor);
    }

    if (stageId === RIFT_DEFENSE_STAGE_ID) {
      if (!isEndlessUnlocked(saveData)) {
        throw new Error("균열 봉쇄전은 프롤로그를 모두 클리어한 뒤 개방됩니다.");
      }

      const isChangingFromActiveBattle =
        saveData.stageStatus === "in_progress" &&
        saveData.battleState &&
        saveData.stageId !== stageId;

      if (isChangingFromActiveBattle && !(options && options.abandonCurrentBattle)) {
        throw new Error("진행 중인 전투가 있어 다른 스테이지로 변경할 수 없습니다.");
      }

      if (isChangingFromActiveBattle) {
        saveData.battleState = null;
        saveData.stageStatus = "ready";
        saveData.phase = "player";
        saveData.turnNumber = 1;
      }

      saveData.campaign = saveData.campaign || {
        currentStageIndex: 0,
        clearedStageIds: [],
        availableStageIds: [STAGE_DEFINITIONS[0].id],
        lastResult: null
      };
      ensureRiftDefenseState(saveData);
      saveData.stageId = RIFT_DEFENSE_STAGE_ID;

      if (saveData.stageStatus !== "in_progress") {
        saveData.stageStatus = "ready";
        saveData.battleState = null;
        saveData.phase = "player";
        saveData.turnNumber = 1;
      }

      return buildRiftDefenseStageDefinition();
    }

    const stageIndex = STAGE_DEFINITIONS.findIndex((stage) => stage.id === stageId);

    if (stageIndex < 0) {
      throw new Error("선택한 스테이지를 찾을 수 없습니다.");
    }

    saveData.campaign = saveData.campaign || {
      currentStageIndex: 0,
      clearedStageIds: [],
      availableStageIds: [STAGE_DEFINITIONS[0].id],
      lastResult: null
    };

    if (!(saveData.campaign.availableStageIds || []).includes(stageId)) {
      throw new Error("아직 개방되지 않은 스테이지입니다.");
    }

    if (isStageReplayLocked(saveData, stageId)) {
      throw new Error("프롤로그는 클리어 후 다시 입장할 수 없습니다.");
    }

    const isChangingFromActiveBattle =
      saveData.stageStatus === "in_progress" &&
      saveData.battleState &&
      saveData.stageId !== stageId;

    if (isChangingFromActiveBattle && !(options && options.abandonCurrentBattle)) {
      throw new Error("진행 중인 전투가 있어 다른 스테이지로 변경할 수 없습니다.");
    }

    if (isChangingFromActiveBattle) {
      saveData.battleState = null;
      saveData.stageStatus = "ready";
      saveData.phase = "player";
      saveData.turnNumber = 1;
    }

    saveData.campaign.currentStageIndex = stageIndex;
    saveData.stageId = stageId;

    if (saveData.stageStatus !== "in_progress") {
      saveData.stageStatus = "ready";
      saveData.battleState = null;
      saveData.phase = "player";
      saveData.turnNumber = 1;
    }

    return getStageDefinitionById(stageId);
  }

  function attackTarget(targetId) {
    const attacker = getUnitById(state.ui.selectedUnitId);
    const defender = getUnitById(targetId);

    if (!attacker || !defender || !attacker.alive || !defender.alive) {
      return;
    }

    if (!state.ui.attackableTargetIds.includes(targetId)) {
      return;
    }

    const result = CombatService.resolveAttack(attacker, defender, {
      attackerTileType: getTileType(attacker.x, attacker.y),
      defenderTileType: getTileType(defender.x, defender.y),
      attackerElevation: getTileElevation(attacker.x, attacker.y),
      defenderElevation: getTileElevation(defender.x, defender.y)
    });

    if (!result.canAttack) {
      addLog(`${attacker.name}은(는) 사용할 무기가 없습니다.`);
      notify();
      return;
    }

    if (result.didHit) {
      addLog(`${attacker.name} -> ${defender.name}: ${result.damageDealt} 피해${result.didCrit ? " / 치명타!" : ""}`);
      applyOnHitAilments(attacker, defender, `${attacker.name}의 공격`);
      applyLifeSteal(attacker, result.damageDealt, "공격 흡혈");
      updateEndlessRunStat((currentRun) => {
        currentRun.damageDealt += result.damageDealt;
      });
    } else {
      addLog(`${attacker.name}의 공격이 빗나갔습니다.`);
    }

    if (result.preview.triggeredSkills && result.preview.triggeredSkills.length) {
      addLog(`스킬 발동: ${result.preview.triggeredSkills.join(", ")}`);
    }

    if (result.preview.elevationNote) {
      addLog(`지형 보정: ${result.preview.elevationNote}`);
    }

    if (result.targetDefeated) {
      handleUnitDefeat(defender);
      applyOnKillRewards(defender, attacker, "처치 보상");
      maybeGrantLoot(defender, attacker);
    } else {
      tryCounterAttack(attacker, defender);
    }

    applyExperience(attacker, result.expGained);
    evaluateStageEvents("boss_hp_half");
    finalizeUnitAction(attacker);

    if (checkBattleEnd()) {
      finishBattlePersistence();
      notify();
      return;
    }

    if (autoSelectNextControllableAlly(attacker.id)) {
      return;
    }

    notify();
  }

  function waitSelectedUnit() {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return;
    }

    if (state.ui.movePreview && state.ui.movePreview.unitId === unit.id) {
      throw new Error("이동 미리보기를 먼저 확정하거나 취소하세요.");
    }

    addLog(`${unit.name} 대기`);
    finalizeUnitAction(unit);
    if (autoSelectNextControllableAlly(unit.id)) {
      return;
    }

    notify();
  }

  function useConsumable(itemId) {
    const unit = getUnitById(state.ui.selectedUnitId);

    if (!canPlayerControl(unit)) {
      return null;
    }

    try {
      const result = InventoryService.applyConsumableToUnit(state.saveData, unit, itemId);

      if (result.effectKind === "heal") {
        addLog(`${unit.name}이(가) ${result.item.name} 사용, HP ${result.healed} 회복`);
      } else if (result.effectKind === "reset_stats") {
        syncBattleUnitEquipmentState(unit.id);
        addLog(`${unit.name}이(가) ${result.item.name} 사용, 스탯 포인트 ${result.refundedPoints} 반환`);
      } else {
        addLog(`${unit.name}이(가) ${result.item.name} 사용`);
      }

      finalizeUnitAction(unit);
      syncPersistentFromBattle({ keepBattleState: true });
      if (autoSelectNextControllableAlly(unit.id)) {
        return result;
      }
      notify();
      return result;
    } catch (error) {
      throw error;
    }
  }

  function finalizePlayerTurnState() {
    if (!state.battle) {
      return;
    }

    if (state.ui.movePreview) {
      addLog("이동 미리보기를 취소하고 턴을 종료합니다.");
    }

    if (state.ui.pendingMove) {
      const movedUnit = getUnitById(state.ui.pendingMove.unitId);

      if (movedUnit && movedUnit.alive) {
        addLog(`${movedUnit.name} 행동 종료`);
      }
    }

    state.battle.units.forEach((unit) => {
      if (unit.team === "ally" && unit.alive) {
        unit.acted = true;
      }
    });
  }

  function endPlayerTurn() {
    if (!state.battle || state.battle.phase !== "player" || state.battle.status !== "in_progress") {
      return;
    }

    if (state.battle.victoryCondition === "support_complete") {
      return;
    }

    finalizePlayerTurnState();
    resetUiState();
    state.battle.phase = "enemy";
    decrementTeamEffects("enemy");
    state.battle.units.forEach((unit) => {
      if (unit.team === "enemy" && unit.alive) {
        unit.acted = false;
        resetTurnCombatFlags(unit);
      }
    });
    addLog("적 턴 시작");
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
  }

  function beginPlayerTurn() {
    state.battle.phase = "player";
    state.battle.turnNumber += 1;
    decrementTeamEffects("ally");
    state.battle.units.forEach((unit) => {
      if (unit.team === "ally" && unit.alive) {
        unit.acted = false;
        resetTurnCombatFlags(unit);
      }
    });
    addLog(`아군 턴 ${state.battle.turnNumber}`);
    evaluateStageEvents("turn_start");
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
  }

  function collectEnemyAttackOptions(enemy, reachableTiles, allies) {
    const options = [];
    const getTargetPriority = (ally) => (
      (ally && ally.isLeader ? 16 : 0)
      + (ally && ally.weapon && ally.weapon.rangeMax >= 2 ? 8 : 0)
      + Math.max(0, 8 - Number(ally && ally.def || 0))
      + ((ally && ally.maxHp > 0 && (ally.hp / ally.maxHp) <= 0.55) ? 10 : 0)
    );

    reachableTiles.forEach((origin) => {
      allies.forEach((ally) => {
        if (CombatService.isInWeaponRange(enemy, origin, { x: ally.x, y: ally.y }, {
          attackerTileType: getTileType(origin.x, origin.y),
          attackerElevation: getTileElevation(origin.x, origin.y),
          defenderTileType: getTileType(ally.x, ally.y),
          defenderElevation: getTileElevation(ally.x, ally.y)
        })) {
          const preview = calculatePreviewFromOrigin(enemy, origin, ally);
          options.push({
            origin,
            target: ally,
            distanceToTarget: Math.abs(origin.x - ally.x) + Math.abs(origin.y - ally.y),
            estimatedDamage: preview.damage || 0,
            wouldDefeat: (preview.damage || 0) >= ally.hp,
            hitRate: preview.hitRate || 0,
            terrainAdvantage: preview.elevationDelta || 0,
            rangeBonus: preview.rangeBonus || 0,
            targetPriority: getTargetPriority(ally)
          });
        }
      });
    });

    return options;
  }

  function collectEnemySkillOptions(enemy, reachableTiles) {
    const options = [];
    const activeSkills = getActiveSkills(enemy).filter((skill) => skill.cooldownRemaining <= 0);
    const eliteSkillPriorityBonus = enemy.isElite ? 6 : 0;
    const getTargetPriority = (target) => (
      (target && target.isLeader ? 16 : 0)
      + (target && target.weapon && target.weapon.rangeMax >= 2 ? 8 : 0)
      + Math.max(0, 8 - Number(target && target.def || 0))
      + ((target && target.maxHp > 0 && (target.hp / target.maxHp) <= 0.55) ? 10 : 0)
    );

    activeSkills.forEach((skill) => {
      const candidateOrigins = skill.targetType === "self" ? [{ x: enemy.x, y: enemy.y }] : reachableTiles;

      candidateOrigins.forEach((origin) => {
        const targets = collectSkillTargets(enemy, skill, origin);

        targets.forEach((targetId) => {
          const target = getUnitById(targetId);

          if (!target) {
            return;
          }

          if (skill.effect.kind === "heal") {
            const missingHp = target.maxHp - target.hp;

            if (missingHp <= 0) {
              return;
            }

            options.push({
              skillId: skill.id,
              origin,
              targetId: target.id,
              effectKind: "heal",
              estimatedValue: Math.min(skill.effect.amount || 0, missingHp),
              wouldDefeat: false,
              priority: 18 + eliteSkillPriorityBonus,
              distanceToTarget: Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y),
              terrainAdvantage: (origin.elevation || 0) - getTileElevation(target.x, target.y),
              targetPriority: getTargetPriority(target)
            });
          }

          if (skill.effect.kind === "buff") {
            if (hasStatusEffect(target, skill.effect.buff.id)) {
              return;
            }

            options.push({
              skillId: skill.id,
              origin,
              targetId: target.id,
              effectKind: "buff",
              estimatedValue:
                (skill.effect.buff.attackPowerBonus || 0) * 3 +
                (skill.effect.buff.defenseBonus || 0) * 3 +
                (skill.effect.buff.hitBonus || 0),
              wouldDefeat: false,
              priority: (target.id === enemy.id ? 12 : 10) + eliteSkillPriorityBonus + (enemy.hp <= Math.ceil(enemy.maxHp / 2) ? 4 : 0),
              distanceToTarget: Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y),
              terrainAdvantage: 0,
              targetPriority: getTargetPriority(target)
            });
          }

          if (skill.effect.kind === "attack") {
            const preview = calculatePreviewFromOrigin(enemy, origin, target);

            if (!preview.canAttack) {
              return;
            }

            const estimatedDamage = Math.max(0, (preview.damage || 0) + (skill.effect.damageBonus || 0));
            options.push({
              skillId: skill.id,
              origin,
              targetId: target.id,
              effectKind: "attack",
              estimatedValue: estimatedDamage,
              wouldDefeat: estimatedDamage >= target.hp,
              priority: (estimatedDamage >= target.hp ? 40 : 30) + eliteSkillPriorityBonus + (enemy.isBoss ? 4 : 0),
              distanceToTarget: Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y),
              terrainAdvantage: preview.elevationDelta || 0,
              hitRate: preview.hitRate || 0,
              rangeBonus: preview.rangeBonus || 0,
              targetPriority: getTargetPriority(target)
            });
          }
        });
      });
    });

    return options;
  }

  function moveUnit(unit, position) {
    if (!position) {
      return;
    }

    unit.x = position.x;
    unit.y = position.y;
  }

  function updateRiftDefenseEnemyCount() {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return;
    }

    state.battle.defenseState.enemiesRemainingInWave = getAliveUnitsByTeam("enemy").length;
  }

  function buildRiftDefenseObjectiveTarget(enemy) {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState) {
      return null;
    }

    const objectivePosition = getRiftDefenseObjectivePosition();
    const defenseState = state.battle.defenseState;
    const objectiveRatio = Number(defenseState.objectiveMaxHp || 0) > 0
      ? Number(defenseState.objectiveHp || 0) / Number(defenseState.objectiveMaxHp || 1)
      : 0;
    const pressure = Number(enemy && enemy.objectivePressure || 0);

    if (!objectivePosition || pressure <= 0) {
      return null;
    }

    return {
      kind: "objective",
      id: "rift-defense-objective",
      name: RIFT_DEFENSE_OBJECTIVE.label,
      x: objectivePosition.x,
      y: objectivePosition.y,
      hp: defenseState.objectiveHp,
      maxHp: defenseState.objectiveMaxHp,
      priority: pressure + (objectiveRatio <= 0.4 ? 5 : objectiveRatio <= 0.7 ? 2 : 0)
    };
  }

  function maybeResolveRiftDefenseObjectiveStrike(enemy, action) {
    if (!isRiftDefenseBattle(state.battle) || !state.battle.defenseState || !enemy || !enemy.alive) {
      return false;
    }

    const defenseState = state.battle.defenseState;
    const objectivePosition = getRiftDefenseObjectivePosition();
    const distance = objectivePosition
      ? Math.abs(enemy.x - objectivePosition.x) + Math.abs(enemy.y - objectivePosition.y)
      : Number.POSITIVE_INFINITY;
    const shouldPrioritizeObjective = Number(enemy.objectivePressure || 0) >= 10;

    if (distance !== 1) {
      return false;
    }

    if (action && action.type === "attack" && action.targetId && !shouldPrioritizeObjective) {
      return false;
    }

    const damage = Math.max(
      1,
      Math.floor(Number(enemy.str || enemy.level || 1) / 3)
        + (enemy.isBoss ? 2 : 0)
        + (enemy.isElite ? 1 : 0)
        + Number(enemy.objectiveDamageBonus || 0)
    );

    defenseState.objectiveHp = Math.max(0, Number(defenseState.objectiveHp || 0) - damage);
    state.battle.lastEventText = `${enemy.name}이(가) 거점을 공격했다.`;
    addLog(`${enemy.name}이(가) 거점에 ${damage} 피해`);
    updateRiftDefenseRewardPreview();
    return true;
  }

  async function runEnemyPhase() {
    if (!state.battle || state.battle.phase !== "enemy" || state.battle.status !== "in_progress") {
      return;
    }

    const wait = (ms) => new Promise((resolve) => global.setTimeout(resolve, ms));

    for (let index = 0; index < state.battle.units.length; index += 1) {
      const enemy = state.battle.units[index];

      if (enemy.team !== "enemy" || !enemy.alive || enemy.acted || state.battle.status !== "in_progress") {
        continue;
      }

      const allies = getAliveUnitsByTeam("ally");
      const reachableTiles = buildReachableTiles(enemy, true);
      const attackOptions = collectEnemyAttackOptions(enemy, reachableTiles, allies);
      const skillOptions = collectEnemySkillOptions(enemy, reachableTiles);
      const action = AIService.decideEnemyAction({
        enemy,
        allies,
        reachableTiles,
        attackOptions,
        skillOptions,
        objectiveTarget: buildRiftDefenseObjectiveTarget(enemy)
      });

      if (action.moveTo) {
        enemy.movedThisTurn = enemy.x !== action.moveTo.x || enemy.y !== action.moveTo.y;
        moveUnit(enemy, action.moveTo);
      }

      try {
        if (maybeResolveRiftDefenseObjectiveStrike(enemy, action)) {
          addLog(`${enemy.name} 방어선 돌파 시도`);
        } else
        if (action.type === "skill" && action.skillId) {
          const skill = getSkillById(enemy, action.skillId);
          const target = getUnitById(action.targetId || enemy.id);

          if (skill && target) {
            executeSkill(enemy, skill, target);
          } else {
            addLog(`${enemy.name} 대기`);
          }
        } else if (action.targetId) {
          const target = getUnitById(action.targetId);

          if (!target) {
            throw new Error("공격 대상을 찾을 수 없습니다.");
          }

          const result = CombatService.resolveAttack(enemy, target, {
            attackerTileType: getTileType(enemy.x, enemy.y),
            defenderTileType: getTileType(target.x, target.y),
            attackerElevation: getTileElevation(enemy.x, enemy.y),
            defenderElevation: getTileElevation(target.x, target.y)
          });

          if (result.didHit) {
            addLog(`${enemy.name} -> ${target.name}: ${result.damageDealt} 피해${result.didCrit ? " / 치명타!" : ""}`);
            applyOnHitAilments(enemy, target, `${enemy.name}의 공격`);
            applyLifeSteal(enemy, result.damageDealt, "적 흡혈");
            updateEndlessRunStat((currentRun) => {
              currentRun.damageTaken += result.damageDealt;
            });
          } else {
            addLog(`${enemy.name}의 공격이 빗나갔습니다.`);
          }

          if (result.preview.triggeredSkills && result.preview.triggeredSkills.length) {
            addLog(`스킬 발동: ${result.preview.triggeredSkills.join(", ")}`);
          }

          if (result.preview.elevationNote) {
            addLog(`지형 보정: ${result.preview.elevationNote}`);
          }

          if (result.targetDefeated) {
            handleUnitDefeat(target);
            applyOnKillRewards(target, enemy, "적 처치 보상");
          } else {
            tryCounterAttack(enemy, target);
          }

          evaluateStageEvents("boss_hp_half");
        } else if (action.moveTo) {
          addLog(`${enemy.name} 이동`);
        } else {
          addLog(`${enemy.name} 대기`);
        }
      } catch (error) {
        addLog(`${enemy.name} 행동 오류: ${error.message || "대기 처리"}`);
        state.ui.pendingMove = null;
        state.ui.movePreview = null;
        state.ui.pendingSkillId = null;
        state.ui.pendingAttack = false;
        state.ui.reachableTiles = [];
        state.ui.attackTiles = [];
        state.ui.attackableTargetIds = [];
        state.ui.skillTiles = [];
        state.ui.skillTargetIds = [];
        state.ui.selectedUnitId = null;
      }

      enemy.acted = true;
      updateRiftDefenseEnemyCount();
      syncPersistentFromBattle({ keepBattleState: true });
      notify();

      if (checkBattleEnd()) {
        finishBattlePersistence();
        notify();
        return;
      }

      await wait(420);
    }

    beginPlayerTurn();
  }

  function handleTileSelection(x, y) {
    if (!state.battle || state.battle.status !== "in_progress") {
      return;
    }

    const occupant = getUnitAt(x, y);

    if (state.battle.phase !== "player") {
      if (occupant) {
        selectUnit(occupant.id);
      }
      return;
    }

    if (occupant && state.ui.selectedUnitId && state.ui.pendingSkillId && state.ui.skillTargetIds.includes(occupant.id)) {
      useSkill(state.ui.pendingSkillId, occupant.id);
      return;
    }

    if (
      occupant &&
      state.ui.selectedUnitId &&
      state.ui.pendingAttack &&
      occupant.team === "enemy" &&
      state.ui.attackableTargetIds.includes(occupant.id)
    ) {
      attackTarget(occupant.id);
      return;
    }

    if (occupant && occupant.team === "ally") {
      if (state.ui.pendingAttack) {
        return;
      }

      if (state.ui.pendingMove && state.ui.pendingMove.unitId !== occupant.id) {
        return;
      }

      if (state.ui.movePreview && state.ui.movePreview.unitId !== occupant.id) {
        return;
      }

      selectUnit(occupant.id);
      return;
    }

    if (occupant && occupant.team === "enemy") {
      if (state.ui.pendingMove || state.ui.pendingAttack || state.ui.pendingSkillId) {
        return;
      }

      selectUnit(occupant.id);
      return;
    }

    if (!occupant && state.ui.selectedUnitId) {
      const unit = getUnitById(state.ui.selectedUnitId);

      if (state.ui.pendingAttack) {
        state.ui.pendingAttack = false;
        state.ui.attackTiles = [];
        state.ui.attackableTargetIds = [];
        if (unit) {
          refreshSelectionState(unit);
        }
        notify();
        return;
      }

      if (state.ui.pendingSkillId) {
        state.ui.pendingSkillId = null;
        state.ui.skillTiles = [];
        state.ui.skillTargetIds = [];
        if (unit) {
          refreshSelectionState(unit);
        }
        notify();
        return;
      }

      if (!canPlayerControl(unit)) {
        resetUiState();
        notify();
        return;
      }

      previewMoveSelection(x, y);
      return;
    }

    if (occupant && state.ui.pendingMove) {
      return;
    }

    resetUiState();
    notify();
  }

  function equipItem(unitId, itemId) {
    const targetItem = InventoryService.getItemById(state.saveData, itemId);
    const previousOwnerId = targetItem ? targetItem.equippedBy : null;
    const equippedItem = InventoryService.equipItemToUnit(state.saveData, unitId, itemId);
    const previousOwner = previousOwnerId ? getUnitById(previousOwnerId) : null;

    syncBattleUnitEquipmentState(unitId);

    if (previousOwner && previousOwner.id !== unitId) {
      syncBattleUnitEquipmentState(previousOwner.id);
    }

    syncPersistentFromBattle({ keepBattleState: state.saveData.stageStatus === "in_progress" });
    notify();
    return equippedItem;
  }

  function allocateStat(unitId, statName) {
    const updatedUnit = StatsService.allocateStatPoint(state.saveData, unitId, statName);
    syncBattleUnitEquipmentState(unitId);
    const battleUnit = getUnitById(unitId);

    if (battleUnit) {
      battleUnit.primaryStats = clone(updatedUnit.primaryStats || {});
      battleUnit.hiddenStats = clone(updatedUnit.hiddenStats || {});
      battleUnit.statPoints = updatedUnit.statPoints;
      battleUnit.skillPoints = updatedUnit.skillPoints || 0;
      battleUnit.equippedActiveSkillIds = clone(updatedUnit.equippedActiveSkillIds || []);
      battleUnit.skillLevels = clone(updatedUnit.skillLevels || {});
    }

    syncPersistentFromBattle({ keepBattleState: state.saveData.stageStatus === "in_progress" });
    notify();
    return updatedUnit;
  }

  function applyProgressionDraft(unitId, statDraft, skillIds) {
    const persistentUnit = StatsService.getUnitById(state.saveData, unitId);

    if (!persistentUnit) {
      throw new Error("성장 정보를 적용할 유닛을 찾을 수 없습니다.");
    }

    const nextStatDraft = statDraft || {};
    const nextSkillIds = Array.isArray(skillIds) ? skillIds.slice() : [];
    const spentStats = StatsService.PRIMARY_STATS.reduce((sum, statName) => sum + Number(nextStatDraft[statName] || 0), 0);

    if (spentStats > 0) {
      StatsService.applyStatDraft(state.saveData, unitId, nextStatDraft);
    }

    nextSkillIds.forEach((skillId) => {
      SkillsService.learnSkill(persistentUnit, skillId);
    });

    syncBattleUnitEquipmentState(unitId);
    const battleUnit = getUnitById(unitId);

    if (battleUnit) {
      battleUnit.primaryStats = clone(persistentUnit.primaryStats || {});
      battleUnit.hiddenStats = clone(persistentUnit.hiddenStats || {});
      battleUnit.maxHp = persistentUnit.maxHp;
      battleUnit.hp = Math.min(Math.max(1, battleUnit.hp || persistentUnit.hp || persistentUnit.maxHp), persistentUnit.maxHp);
      battleUnit.str = persistentUnit.str;
      battleUnit.skl = persistentUnit.skl;
      battleUnit.spd = persistentUnit.spd;
      battleUnit.def = persistentUnit.def;
      battleUnit.mov = persistentUnit.mov;
      battleUnit.statPoints = persistentUnit.statPoints || 0;
      battleUnit.skillPoints = persistentUnit.skillPoints || 0;
      battleUnit.learnedSkillIds = clone(persistentUnit.learnedSkillIds || []);
      battleUnit.learnedActiveSkillIds = clone(persistentUnit.learnedActiveSkillIds || []);
      battleUnit.equippedActiveSkillIds = clone(persistentUnit.equippedActiveSkillIds || []);
      battleUnit.skillLevels = clone(persistentUnit.skillLevels || {});
    }

    syncPersistentFromBattle({ keepBattleState: state.saveData.stageStatus === "in_progress" });
    notify();
    return persistentUnit;
  }

  function markCutsceneSeen() {
    if (!state.battle) {
      return;
    }

    state.battle.cutsceneSeen = true;
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
  }

  function markTutorialSeen(tutorialKey) {
    if (!state.saveData || !tutorialKey) {
      return;
    }

    if (!state.saveData.tutorial || typeof state.saveData.tutorial !== "object") {
      state.saveData.tutorial = {};
    }

    if (state.saveData.tutorial[tutorialKey]) {
      return;
    }

    state.saveData.tutorial[tutorialKey] = true;

    if (state.battle) {
      syncPersistentFromBattle({ keepBattleState: true });
    }

    notify();
  }

  function chooseEndlessReward(choiceId) {
    if (!state.battle || !state.battle.pendingChoice) {
      throw new Error("선택할 보상이 없습니다.");
    }

    const choice = (state.battle.pendingChoice.choices || []).find((entry) => entry.id === choiceId);

    if (!choice) {
      throw new Error("선택한 보상을 찾을 수 없습니다.");
    }

    ensureEndlessState();

    if (state.battle.pendingChoice.type === "relic") {
      if (!state.saveData.endless.relicIds.includes(choice.id)) {
        state.saveData.endless.relicIds.push(choice.id);
      }

      updateEndlessRunStat((currentRun) => {
        currentRun.relicsCollected += 1;
      });
      addLog(`유물 획득: ${choice.title}`);
      state.battle.lastEventText = `${choice.title}의 힘이 파티에 스며들었다.`;
    }

    if (state.battle.pendingChoice.type === "event") {
      if ((choice.goldCost || 0) > 0) {
        if ((state.saveData.partyGold || 0) < (choice.goldCost || 0)) {
          throw new Error("골드가 부족합니다.");
        }

        state.saveData.partyGold -= choice.goldCost || 0;
      }

      if (choice.eventKind === "chain_start" && choice.chainId) {
        const chainState = startEventChain(choice.chainId);
        addLog(`연속 사건 시작: ${chainState.name}`);
        state.battle.lastEventText = `${chainState.name}의 실마리를 붙잡았다.`;
      }

      if (choice.eventKind === "chain_resolve" && choice.chainId) {
        resolveEventChain(choice);
        state.battle.lastEventText = `${choice.title} 해결 완료`;
      }

      if (choice.id === "salvage_cache") {
        const goldReward = choice.goldReward || 0;
        state.saveData.partyGold += goldReward;
        updateEndlessRunStat((currentRun) => {
          currentRun.goldEarned += goldReward;
        });
        addLog(`이벤트 선택: ${goldReward}G 획득`);
      }

      if (choice.id === "training_notes") {
        getSelectedPartyUnits().forEach((unit) => {
          unit.statPoints = (unit.statPoints || 0) + (choice.statPointAmount || 1);
        });
        addLog(`이벤트 선택: 출전 파티 전원의 스탯 포인트 +${choice.statPointAmount || 1}`);
      }

      if (choice.id === "battle_drill") {
        grantPartyExperience(choice.expReward || 0);
        addLog(`이벤트 선택: 출전 파티 전원이 EXP ${choice.expReward || 0} 획득`);
      }

      if ((choice.skillPointAmount || 0) > 0) {
        grantPartySkillPoints(choice.skillPointAmount || 0);
        addLog(`이벤트 선택: 출전 파티 전원의 스킬 포인트 +${choice.skillPointAmount || 0}`);
      }

      if (choice.id === "weapon_maintenance") {
        const repairedCount = repairSelectedPartyWeapons(choice.repairAmount || 0);
        addLog(`이벤트 선택: 장착 무기 ${repairedCount}개 정비 (+${choice.repairAmount || 0})`);
      }

      if (choice.id === "supply_crate") {
        const items = grantEventConsumables();
        addLog(`이벤트 선택: ${items.map((item) => item.name).join(", ")} 확보`);
      }

      if (choice.fixedItemIds && choice.fixedItemIds.length) {
        const items = grantFixedItems(choice.fixedItemIds);
        addLog(`이벤트 선택: ${items.map((item) => item.name).join(", ")} 확보`);
      }

      if (choice.id === "rift_spoils") {
        const item = grantEventLoot(choice.lootLevel || (state.battle.endlessFloor || 1));
        addLog(`이벤트 선택: ${item.name} 확보`);
      }

      applyEndlessGrowthChoice(choice, "이벤트");

      if (choice.id === "relic_echo") {
        if (!choice.relicId || state.saveData.endless.relicIds.includes(choice.relicId)) {
          throw new Error("획득 가능한 유물이 남아 있지 않습니다.");
        }

        state.saveData.endless.relicIds.push(choice.relicId);
        updateEndlessRunStat((currentRun) => {
          currentRun.relicsCollected += 1;
        });
        addLog(`이벤트 선택: ${choice.relicTitle || choice.title} 획득`);
      }

      if (choice.id === "black_market") {
        if ((state.saveData.partyGold || 0) < (choice.price || 0)) {
          throw new Error("골드가 부족해 균열 암시장을 이용할 수 없습니다.");
        }

        state.saveData.partyGold -= choice.price || 0;
        const charm = InventoryService.buildShopItem("shop-guardian-charm");
        const potion = InventoryService.buildShopItem("shop-hi-potion");
        InventoryService.addItemToInventory(state.saveData, charm);
        InventoryService.addItemToInventory(state.saveData, potion);
        state.battle.rewardHistory.push(charm, potion);
        updateEndlessRunStat((currentRun) => {
          currentRun.purchases += 1;
        });
        addLog(`이벤트 선택: ${choice.price}G 지불 후 ${charm.name}, ${potion.name} 확보`);
      }

      if ((choice.fullRecoverParty || false) || (choice.healPartyAmount || 0) > 0) {
        const healedCount = restoreSelectedPartyHealth(choice.healPartyAmount || 0, choice.fullRecoverParty);
        addLog(`이벤트 선택: 출전 파티 ${healedCount}명 회복`);
      }

      syncSelectedBattleUnitsFromPersistent();

      if (!choice.eventKind) {
        state.battle.lastEventText = `${choice.title} 선택 완료`;
      }
    }

    if (state.battle.pendingChoice.type === "contact") {
      if ((choice.goldCost || 0) > 0) {
        if ((state.saveData.partyGold || 0) < (choice.goldCost || 0)) {
          throw new Error("골드가 부족합니다.");
        }

        state.saveData.partyGold -= choice.goldCost || 0;
      }

      if ((choice.goldReward || 0) > 0) {
        state.saveData.partyGold += choice.goldReward || 0;
        updateEndlessRunStat((currentRun) => {
          currentRun.goldEarned += choice.goldReward || 0;
        });
      }

      if ((choice.expReward || 0) > 0) {
        grantPartyExperience(choice.expReward || 0);
      }

      if ((choice.statPointAmount || 0) > 0) {
        grantPartyStatPoints(choice.statPointAmount || 0);
      }

      if ((choice.skillPointAmount || 0) > 0) {
        grantPartySkillPoints(choice.skillPointAmount || 0);
      }

      applyEndlessGrowthChoice(choice, "접촉 이벤트");

      if ((choice.repairAmount || 0) > 0) {
        repairSelectedPartyWeapons(choice.repairAmount || 0);
      }

      if (choice.fixedItemIds && choice.fixedItemIds.length) {
        grantFixedItems(choice.fixedItemIds);
      }

      if (Number.isFinite(choice.lootLevel)) {
        grantEventLoot(choice.lootLevel);
      }

      if (choice.recruitTemplateId) {
        const recruit = grantEncounterRecruit(choice.recruitTemplateId, state.battle.endlessFloor || 1);
        addLog(`접촉 이벤트: ${recruit.unit.name} 합류`);
      }

      if ((choice.fullRecoverParty || false) || (choice.healPartyAmount || 0) > 0) {
        const healedCount = restoreSelectedPartyHealth(choice.healPartyAmount || 0, choice.fullRecoverParty);
        addLog(`접촉 이벤트 선택: 출전 파티 ${healedCount}명 회복`);
      }

      removeBattleMarker(state.battle.pendingChoice.markerId);
      syncSelectedBattleUnitsFromPersistent();
      state.battle.lastEventText = `${choice.title} 처리 완료`;
      addLog(`접촉 이벤트 선택: ${choice.title}`);
    }

    state.battle.pendingChoice = null;
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
    return choice;
  }

  function purchaseEndlessShopItem(productId) {
    if (!state.battle || !state.battle.pendingChoice || state.battle.pendingChoice.type !== "shop") {
      throw new Error("현재 균열 상점이 열려 있지 않습니다.");
    }

    const choice = (state.battle.pendingChoice.choices || []).find((entry) => entry.id === productId);

    if (!choice) {
      throw new Error("상점 상품을 찾을 수 없습니다.");
    }

    const item = InventoryService.purchaseItem(state.saveData, productId);
    updateEndlessRunStat((currentRun) => {
      currentRun.purchases += 1;
    });
    addLog(`상점 구매: ${item.name} (${choice.price}G)`);
    state.battle.lastEventText = `${item.name} 구매 완료`;
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
    return item;
  }

  function dismissEndlessChoice() {
    if (!state.battle || !state.battle.pendingChoice) {
      return false;
    }

    if (state.battle.pendingChoice.type !== "shop") {
      return false;
    }

    state.battle.pendingChoice = null;
    state.battle.lastEventText = "상점 정비를 마치고 다음 층으로 이동할 준비를 마쳤다.";
    syncPersistentFromBattle({ keepBattleState: true });
    notify();
    return true;
  }

  function completeSupportFloor() {
    if (!state.battle || state.battle.status !== "in_progress" || state.battle.victoryCondition !== "support_complete") {
      return false;
    }

    if (state.battle.pendingChoice) {
      return false;
    }

    addLog(`${state.battle.stageName} 정비 완료. 다음 층으로 이동합니다.`);
    state.battle.status = "victory";
    state.saveData.battleState = null;
    resetUiState();
    applyStageRewards();
    advanceCampaignOnVictory();
    finishBattlePersistence();
    notify();
    return true;
  }

  global.BattleService = {
    subscribe,
    launch,
    leaveBattle,
    getSnapshot,
    handleTileSelection,
    selectUnit,
    setPendingAttack,
    setPendingSkill,
    cancelPendingSkill,
    getActiveSkills,
    waitSelectedUnit,
    useConsumable,
    undoMove,
    endPlayerTurn,
    runEnemyPhase,
    equipItem,
    commitMovePreview,
    cancelMovePreview,
    applyProgressionDraft,
    allocateStat,
    markCutsceneSeen,
    markTutorialSeen,
    chooseEndlessReward,
    purchaseEndlessShopItem,
    dismissEndlessChoice,
    completeSupportFloor,
    getVictoryProgressText,
    calculateCounterPreview,
    canUseSkillOnCurrentTerrain,
    isEndlessUnlocked,
    getStageCatalog,
    selectCampaignStage,
    getRewardCodex,
    getEndlessRelics,
    getEndlessRunSummary,
    getEndlessCurrentRunSummary
  };
})(window);
