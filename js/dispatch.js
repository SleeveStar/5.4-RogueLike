/* 역할: 던전 파견 임무 생성, 진행, 완료 정산, 보상 수령을 담당한다. */

(function attachDispatchService(global) {
  const InventoryService = global.InventoryService;
  const StatsService = global.StatsService;
  const SkillsService = global.SkillsService;

  const AVAILABLE_MISSION_COUNT = 6;
  const DAILY_REFRESH_LIMIT = 5;
  const MIN_DISPATCH_PARTY_SIZE = 2;
  const MAX_DISPATCH_PARTY_SIZE = 3;
  const MAX_RECENT_LOG_COUNT = 10;

  const EQUIPMENT_SLOT_WEIGHTS = {
    weapon: 8,
    subweapon: 5,
    chest: 4,
    head: 4,
    legs: 4,
    boots: 3,
    bracelet: 3,
    ring: 3,
    charm: 3,
    accessory: 3
  };

  const MISSION_TEMPLATES = [
    {
      type: "shallow_search",
      name: "얕은 수색",
      summary: "근교 폐허를 수색해 기본 보급과 현장 경험을 확보합니다.",
      starRating: 1,
      durationHours: 1,
      expRange: [10, 18],
      goldRange: [40, 70],
      refineStoneChance: 0.15,
      equipmentChance: 0.2,
      qualityBias: 0,
      jackpotChance: 0.003,
      consumablePool: ["shop-potion"]
    },
    {
      type: "supply_recovery",
      name: "보급 회수",
      summary: "버려진 보급 지점을 조사해 안전한 회수 임무를 수행합니다.",
      starRating: 2,
      durationHours: 2,
      expRange: [14, 24],
      goldRange: [55, 95],
      refineStoneChance: 0.2,
      equipmentChance: 0.25,
      qualityBias: 0.01,
      jackpotChance: 0.0045,
      consumablePool: ["shop-potion", "shop-hi-potion"]
    },
    {
      type: "watch_patrol",
      name: "감시초소 순찰",
      summary: "외곽 감시초소를 돌며 몬스터 동향을 정리합니다.",
      starRating: 2,
      durationHours: 2,
      expRange: [16, 26],
      goldRange: [60, 100],
      refineStoneChance: 0.24,
      equipmentChance: 0.3,
      qualityBias: 0.015,
      jackpotChance: 0.005,
      consumablePool: ["shop-potion", "shop-hi-potion"]
    },
    {
      type: "rift_scout",
      name: "균열 정찰",
      summary: "균열 입구를 정찰하며 정보를 수집하고 소규모 전투를 감당합니다.",
      starRating: 3,
      durationHours: 4,
      expRange: [18, 30],
      goldRange: [70, 130],
      refineStoneChance: 0.3,
      equipmentChance: 0.35,
      qualityBias: 0.02,
      jackpotChance: 0.006,
      consumablePool: ["shop-potion", "shop-hi-potion"]
    },
    {
      type: "relic_trace",
      name: "유물 흔적 추적",
      summary: "희미한 유물 반응을 좇아 잔존 전리품을 찾아냅니다.",
      starRating: 3,
      durationHours: 4,
      expRange: [20, 32],
      goldRange: [80, 145],
      refineStoneChance: 0.35,
      equipmentChance: 0.4,
      qualityBias: 0.03,
      jackpotChance: 0.0075,
      consumablePool: ["shop-hi-potion"]
    },
    {
      type: "deep_recovery",
      name: "심층 회수",
      summary: "심층 균열에 진입해 유실 장비와 자료를 회수합니다.",
      starRating: 4,
      durationHours: 6,
      expRange: [30, 48],
      goldRange: [120, 220],
      refineStoneChance: 0.45,
      equipmentChance: 0.5,
      qualityBias: 0.05,
      jackpotChance: 0.01,
      consumablePool: ["shop-hi-potion"]
    },
    {
      type: "abyss_salvage",
      name: "심연 잔해 인양",
      summary: "위험 지역의 잔해를 인양해 고가치 자원을 확보합니다.",
      starRating: 4,
      durationHours: 6,
      expRange: [32, 50],
      goldRange: [130, 235],
      refineStoneChance: 0.52,
      equipmentChance: 0.55,
      qualityBias: 0.06,
      jackpotChance: 0.011,
      consumablePool: ["shop-hi-potion", "shop-stat-reset-scroll"]
    },
    {
      type: "special_hunt",
      name: "특수 토벌 의뢰",
      summary: "정예 위협을 추적 토벌하는 최고난도 장기 임무입니다.",
      starRating: 5,
      durationHours: 8,
      expRange: [42, 70],
      goldRange: [180, 320],
      refineStoneChance: 0.6,
      equipmentChance: 0.65,
      qualityBias: 0.08,
      jackpotChance: 0.015,
      consumablePool: ["shop-hi-potion", "shop-stat-reset-scroll"]
    }
  ];

  const FAILURE_LOGS = [
    "예상보다 강한 적과 조우해 조기 철수했습니다.",
    "회수 목표는 놓쳤지만 현장 경험을 얻었습니다.",
    "지형 붕괴로 깊게 진입하지 못하고 복귀했습니다."
  ];

  const SUCCESS_LOGS = [
    "파견대가 안정적으로 목표 지점을 정리하고 복귀했습니다.",
    "예정한 회수 목표를 무난하게 달성했습니다.",
    "현장 통제를 유지하며 표준 성과를 확보했습니다."
  ];

  const GREAT_LOGS = [
    "예상보다 좋은 전리품을 확보하며 대성공을 거뒀습니다.",
    "파견대가 전장을 빠르게 장악하고 추가 회수까지 마쳤습니다.",
    "전술 판단이 정확히 맞아떨어져 기대 이상의 성과를 올렸습니다."
  ];

  const JACKPOT_LOGS = [
    "균열 중심부에서 귀중한 전리품까지 건져 올리며 대박을 터뜨렸습니다.",
    "예상 외의 고가치 목표를 발견해 길드 전체가 놀랄 전과를 세웠습니다.",
    "극히 드문 기회를 붙잡아 전리품과 기록을 한꺼번에 챙겼습니다."
  ];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getNowTimestamp(nowValue) {
    return nowValue ? new Date(nowValue).getTime() : Date.now();
  }

  function getLocalDateKey(dateValue) {
    const currentDate = dateValue ? new Date(dateValue) : new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getRandomIntInclusive(min, max) {
    const normalizedMin = Math.min(min, max);
    const normalizedMax = Math.max(min, max);
    return normalizedMin + Math.floor(Math.random() * (normalizedMax - normalizedMin + 1));
  }

  function chooseRandomEntry(entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return null;
    }

    return entries[Math.floor(Math.random() * entries.length)];
  }

  function ensureDispatchShape(saveData) {
    if (!saveData) {
      return null;
    }

    const existingDispatch = saveData.dispatch && typeof saveData.dispatch === "object"
      ? saveData.dispatch
      : {};

    saveData.dispatch = Object.assign(existingDispatch, {
      missionSeed: 1,
      availableMissions: [],
      activeMissions: [],
      completedMissions: [],
      reservedUnitIds: [],
      lastGeneratedAt: null,
      refreshCount: 0,
      refreshDateKey: getLocalDateKey(),
      recentDispatchLogs: []
    }, clone(saveData.dispatch || {}));

    saveData.dispatch.availableMissions = clone(saveData.dispatch.availableMissions || []);
    saveData.dispatch.activeMissions = clone(saveData.dispatch.activeMissions || []);
    saveData.dispatch.completedMissions = clone(saveData.dispatch.completedMissions || []);
    saveData.dispatch.recentDispatchLogs = clone(saveData.dispatch.recentDispatchLogs || []).slice(0, MAX_RECENT_LOG_COUNT);

    if (saveData.dispatch.refreshDateKey !== getLocalDateKey()) {
      saveData.dispatch.refreshDateKey = getLocalDateKey();
      saveData.dispatch.refreshCount = 0;
    }

    saveData.dispatch.missionSeed = Math.max(1, Math.floor(Number(saveData.dispatch.missionSeed || 1)));
    saveData.dispatch.refreshCount = Math.max(0, Math.floor(Number(saveData.dispatch.refreshCount || 0)));
    saveData.dispatch.reservedUnitIds = Array.from(new Set(
      saveData.dispatch.activeMissions
        .flatMap((mission) => Array.isArray(mission && mission.unitIds) ? mission.unitIds : [])
        .filter(Boolean)
    ));

    if (Array.isArray(saveData.selectedPartyIds) && saveData.dispatch.reservedUnitIds.length) {
      saveData.selectedPartyIds = saveData.selectedPartyIds.filter((unitId) => !saveData.dispatch.reservedUnitIds.includes(unitId));
    }

    return saveData.dispatch;
  }

  function getRefreshState(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    const remaining = Math.max(0, DAILY_REFRESH_LIMIT - Number(dispatch.refreshCount || 0));
    return {
      limit: DAILY_REFRESH_LIMIT,
      used: Number(dispatch.refreshCount || 0),
      remaining,
      resetAt: `${getLocalDateKey(new Date(Date.now() + 86400000))} 00:00`,
      dateKey: dispatch.refreshDateKey
    };
  }

  function isUnitFrontline(className) {
    return ["로드", "하이로드", "랜서", "팔라딘", "검사", "브리건드", "솔저", "가디언", "센티넬", "홀리랜서", "포트리스", "아크랜서", "버서커", "워브레이커", "데스브링어", "월드이터", "블레이드로드", "소드마스터", "엠퍼러", "검성", "오버로드", "스타블레이드"].includes(className);
  }

  function isUnitRangedOrArcane(className) {
    return ["아처", "스나이퍼", "헌터", "레인저", "트래퍼", "호크아이", "그림트래퍼", "천궁성", "나이트메어헌트", "클레릭", "비숍", "메이지", "위저드", "소서러", "오라클", "세라핌", "인퀴지터", "성녀", "아크저지", "아크메이지", "워록", "대현자", "보이드로드"].includes(className);
  }

  function isUnitSupport(className) {
    return ["클레릭", "비숍", "오라클", "세라핌", "성녀", "인퀴지터", "아크저지"].includes(className);
  }

  function getRosterUnit(saveData, unitId) {
    return (saveData && saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function getAvailableUnits(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    const selectedPartyIds = Array.isArray(saveData && saveData.selectedPartyIds) ? saveData.selectedPartyIds : [];
    const reservedUnitIds = dispatch ? dispatch.reservedUnitIds : [];

    return ((saveData && saveData.roster) || []).filter((unit) => (
      unit
      && unit.alive !== false
      && !selectedPartyIds.includes(unit.id)
      && !reservedUnitIds.includes(unit.id)
    ));
  }

  function isUnitReserved(saveData, unitId) {
    const dispatch = ensureDispatchShape(saveData);
    return !!(dispatch && dispatch.reservedUnitIds.includes(unitId));
  }

  function getReservedUnitIds(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    return dispatch ? dispatch.reservedUnitIds.slice() : [];
  }

  function calculateEquipmentQualityScore(saveData, unitId) {
    const equippedItems = InventoryService.getEquippedItems(saveData, unitId);

    const itemScore = equippedItems.reduce((sum, item) => {
      const itemBuyPrice = Math.max(1, Number(InventoryService.getBuyPrice(item) || 1));
      const slotWeight = EQUIPMENT_SLOT_WEIGHTS[item.equippedSlotKey || item.slot || "accessory"] || 2;
      return sum + Math.floor(Math.sqrt(itemBuyPrice)) + slotWeight;
    }, 0);

    const fullSetBonus = equippedItems.length >= 8
      ? 10
      : equippedItems.length >= 6
        ? 6
        : 0;

    return itemScore + fullSetBonus;
  }

  function calculateUnitDispatchPower(saveData, unit) {
    if (!unit) {
      return 0;
    }

    const level = Math.max(1, Number(unit.level || 1));
    const trainingLevel = Math.max(0, Number(unit.trainingLevel || 0));
    const potentialScore = Math.max(0, Number(unit.potentialScore || 0));
    const equipmentQualityScore = calculateEquipmentQualityScore(saveData, unit.id);

    return Math.round(level * 8 + trainingLevel * 6 + potentialScore * 0.6 + equipmentQualityScore);
  }

  function calculateDispatchSnapshot(saveData, unitIds) {
    const units = (unitIds || [])
      .map((unitId) => getRosterUnit(saveData, unitId))
      .filter(Boolean);

    const memberDispatchPowers = units.map((unit) => ({
      unitId: unit.id,
      name: unit.name,
      power: calculateUnitDispatchPower(saveData, unit),
      equipmentQualityScore: calculateEquipmentQualityScore(saveData, unit.id)
    }));

    let roleBonus = 0;

    if (units.some((unit) => isUnitFrontline(unit.className))) {
      roleBonus += 12;
    }

    if (units.some((unit) => isUnitRangedOrArcane(unit.className))) {
      roleBonus += 10;
    }

    if (units.some((unit) => isUnitSupport(unit.className))) {
      roleBonus += 8;
    }

    const totalLevel = units.reduce((sum, unit) => sum + Math.max(1, Number(unit.level || 1)), 0);
    const memberCount = memberDispatchPowers.length;

    return {
      partyDispatchPower: memberDispatchPowers.reduce((sum, member) => sum + member.power, 0) + roleBonus,
      memberDispatchPowers,
      roleBonus,
      equipmentQualityScoreTotal: memberDispatchPowers.reduce((sum, member) => sum + member.equipmentQualityScore, 0),
      memberCount,
      totalLevel,
      averageLevel: memberCount ? totalLevel / memberCount : 0
    };
  }

  function getAverageRosterPower(saveData) {
    const roster = ((saveData && saveData.roster) || []).filter(Boolean);

    if (!roster.length) {
      return 80;
    }

    const totalPower = roster.reduce((sum, unit) => sum + calculateUnitDispatchPower(saveData, unit), 0);
    return Math.max(40, Math.round(totalPower / roster.length));
  }

  function buildMissionFromTemplate(saveData, template, missionSeed) {
    const averagePower = getAverageRosterPower(saveData);
    const requiredPower = Math.round(averagePower * (1.15 + template.starRating * 0.45));

    return {
      id: `dispatch-mission-${missionSeed}`,
      missionType: template.type,
      missionName: template.name,
      summary: template.summary,
      starRating: template.starRating,
      requiredPower,
      durationHours: template.durationHours,
      expRange: template.expRange.slice(),
      goldRange: template.goldRange.slice(),
      refineStoneChance: Number(template.refineStoneChance || 0),
      equipmentChance: template.equipmentChance,
      qualityBias: template.qualityBias,
      jackpotChance: template.jackpotChance,
      consumablePool: template.consumablePool.slice()
    };
  }

  function fillAvailableMissions(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    const existingTypes = new Set((dispatch.availableMissions || []).map((mission) => mission.missionType));
    const shuffledTemplates = MISSION_TEMPLATES.slice().sort(() => Math.random() - 0.5);

    while (dispatch.availableMissions.length < AVAILABLE_MISSION_COUNT) {
      const template = shuffledTemplates.find((entry) => !existingTypes.has(entry.type))
        || chooseRandomEntry(MISSION_TEMPLATES);

      if (!template) {
        break;
      }

      const mission = buildMissionFromTemplate(saveData, template, dispatch.missionSeed);
      dispatch.missionSeed += 1;
      dispatch.availableMissions.push(mission);
      existingTypes.add(template.type);
    }

    dispatch.lastGeneratedAt = new Date().toISOString();
    return dispatch.availableMissions;
  }

  function removeMissionById(collection, missionId) {
    const source = Array.isArray(collection) ? collection : [];
    const missionIndex = source.findIndex((mission) => mission.id === missionId);

    if (missionIndex < 0) {
      return null;
    }

    const removed = source[missionIndex];
    source.splice(missionIndex, 1);
    return removed;
  }

  function chooseFailureLog() {
    return chooseRandomEntry(FAILURE_LOGS) || FAILURE_LOGS[0];
  }

  function chooseSuccessLog() {
    return chooseRandomEntry(SUCCESS_LOGS) || SUCCESS_LOGS[0];
  }

  function chooseGreatLog() {
    return chooseRandomEntry(GREAT_LOGS) || GREAT_LOGS[0];
  }

  function chooseJackpotLog() {
    return chooseRandomEntry(JACKPOT_LOGS) || JACKPOT_LOGS[0];
  }

  function getRewardScalingContext(mission, snapshot) {
    const safeSnapshot = snapshot || {
      partyDispatchPower: 0,
      memberCount: 0,
      averageLevel: 0,
      equipmentQualityScoreTotal: 0
    };
    const memberCount = Math.max(0, Number(safeSnapshot.memberCount || 0));
    const ratio = Number(safeSnapshot.partyDispatchPower || 0) / Math.max(1, Number(mission && mission.requiredPower || 1));
    const averageLevel = Math.max(1, Number(safeSnapshot.averageLevel || 1));
    const averageEquipmentQuality = memberCount
      ? Number(safeSnapshot.equipmentQualityScoreTotal || 0) / memberCount
      : 0;
    const levelScale = 1 + clamp((averageLevel - Math.max(1, Number(mission && mission.starRating || 1) * 2)) * 0.035, -0.08, 0.32);
    const powerScale = 1 + clamp((ratio - 1) * 0.28, -0.18, 0.42);
    const memberScale = 1 + clamp((memberCount - 1) * 0.06, 0, 0.12);
    const equipmentScale = 1 + clamp((averageEquipmentQuality - 20) / 180, -0.04, 0.16);

    return {
      ratio,
      rewardScale: clamp(levelScale * powerScale * memberScale * equipmentScale, 0.72, 1.85),
      equipmentChanceBonus: clamp((ratio - 0.9) * 0.12 + averageLevel * 0.004 + averageEquipmentQuality * 0.0015, 0, 0.22),
      consumableChanceBonus: clamp((memberCount - 1) * 0.08 + (ratio - 0.9) * 0.12, 0, 0.25),
      rewardLevelBonus: Math.max(0, Math.floor(averageLevel / 4) + (ratio >= 1.15 ? 1 : 0)),
      averageLevel,
      averageEquipmentQuality,
      memberCount
    };
  }

  function getRewardOutcomeProfile(resultKey) {
    if (resultKey === "fail") {
      return {
        goldMultiplier: 0.35,
        expMultiplier: 0.3,
        equipmentChanceBonus: -1,
        refineStoneChanceBonus: -0.12,
        consumableChance: 0.2,
        guaranteedItemCount: 0,
        guaranteedRefineStoneRange: [0, 0]
      };
    }

    if (resultKey === "great") {
      return {
        goldMultiplier: 1.25,
        expMultiplier: 1.25,
        equipmentChanceBonus: 0.18,
        refineStoneChanceBonus: 0.12,
        consumableChance: 0.85,
        guaranteedItemCount: 0,
        guaranteedRefineStoneRange: [0, 0]
      };
    }

    if (resultKey === "jackpot") {
      return {
        goldMultiplier: 2,
        expMultiplier: 1.7,
        equipmentChanceBonus: 1,
        refineStoneChanceBonus: 1,
        consumableChance: 1,
        guaranteedItemCount: 3,
        guaranteedRefineStoneRange: [2, 4]
      };
    }

    return {
      goldMultiplier: 1,
      expMultiplier: 1,
      equipmentChanceBonus: 0,
      refineStoneChanceBonus: 0,
      consumableChance: 0.65,
      guaranteedItemCount: 0,
      guaranteedRefineStoneRange: [0, 0]
    };
  }

  function buildRewardPreview(mission, snapshot, resultBand) {
    const scaling = getRewardScalingContext(mission, snapshot);
    const results = Array.isArray(resultBand) && resultBand.length ? resultBand : ["success"];
    let minGold = Infinity;
    let maxGold = 0;
    let minExp = Infinity;
    let maxExp = 0;
    let minEquipmentChance = Infinity;
    let maxEquipmentChance = 0;
    let minConsumableChance = Infinity;
    let maxConsumableChance = 0;
    let minRefineStoneChance = Infinity;
    let maxRefineStoneChance = 0;
    let minRefineStoneCount = Infinity;
    let maxRefineStoneCount = 0;
    let maxGuaranteedItems = 0;

    results.forEach((resultKey) => {
      const profile = getRewardOutcomeProfile(resultKey);
      const goldMin = Math.max(0, Math.round(mission.goldRange[0] * scaling.rewardScale * profile.goldMultiplier));
      const goldMax = Math.max(goldMin, Math.round(mission.goldRange[1] * scaling.rewardScale * profile.goldMultiplier));
      const expMin = Math.max(1, Math.round(mission.expRange[0] * scaling.rewardScale * profile.expMultiplier));
      const expMax = Math.max(expMin, Math.round(mission.expRange[1] * scaling.rewardScale * profile.expMultiplier));
      const equipmentChance = resultKey === "jackpot"
        ? 1
        : clamp(Number(mission.equipmentChance || 0) + scaling.equipmentChanceBonus + profile.equipmentChanceBonus, 0, 1);
      const consumableChance = resultKey === "jackpot"
        ? 1
        : clamp(profile.consumableChance + scaling.consumableChanceBonus, 0, 1);
      const refineStoneChance = resultKey === "jackpot"
        ? 1
        : clamp(Number(mission.refineStoneChance || 0) + scaling.consumableChanceBonus * 0.45 + profile.refineStoneChanceBonus, 0, 1);
      const refineStoneCountRange = resultKey === "jackpot"
        ? profile.guaranteedRefineStoneRange
        : [refineStoneChance > 0 ? 1 : 0, refineStoneChance > 0.58 ? 2 : 1];

      minGold = Math.min(minGold, goldMin);
      maxGold = Math.max(maxGold, goldMax);
      minExp = Math.min(minExp, expMin);
      maxExp = Math.max(maxExp, expMax);
      minEquipmentChance = Math.min(minEquipmentChance, equipmentChance);
      maxEquipmentChance = Math.max(maxEquipmentChance, equipmentChance);
      minConsumableChance = Math.min(minConsumableChance, consumableChance);
      maxConsumableChance = Math.max(maxConsumableChance, consumableChance);
      minRefineStoneChance = Math.min(minRefineStoneChance, refineStoneChance);
      maxRefineStoneChance = Math.max(maxRefineStoneChance, refineStoneChance);
      minRefineStoneCount = Math.min(minRefineStoneCount, refineStoneCountRange[0]);
      maxRefineStoneCount = Math.max(maxRefineStoneCount, refineStoneCountRange[1]);
      maxGuaranteedItems = Math.max(maxGuaranteedItems, Number(profile.guaranteedItemCount || 0));
    });

    return {
      goldRange: [Number.isFinite(minGold) ? minGold : 0, maxGold],
      expRange: [Number.isFinite(minExp) ? minExp : 0, maxExp],
      equipmentChanceRange: [
        Number.isFinite(minEquipmentChance) ? minEquipmentChance : 0,
        maxEquipmentChance
      ],
      consumableChanceRange: [
        Number.isFinite(minConsumableChance) ? minConsumableChance : 0,
        maxConsumableChance
      ],
      refineStoneChanceRange: [
        Number.isFinite(minRefineStoneChance) ? minRefineStoneChance : 0,
        maxRefineStoneChance
      ],
      refineStoneCountRange: [
        Number.isFinite(minRefineStoneCount) ? minRefineStoneCount : 0,
        maxRefineStoneCount
      ],
      guaranteedItemCount: maxGuaranteedItems,
      scaling
    };
  }

  function getMissionOutcomePreview(saveData, mission, unitIds) {
    const snapshot = calculateDispatchSnapshot(saveData, unitIds || []);
    const missionPower = Math.max(1, Number(mission && mission.requiredPower || 1));
    const ratio = snapshot.partyDispatchPower / missionPower;
    const tags = [];
    let summary = "예상 결과: 성공 중심";
    let resultBand = ["success"];

    if (ratio < 0.78) {
      tags.push("실패 위험 존재");
      summary = "예상 결과: 실패 ~ 성공";
      resultBand = ["fail", "success"];
    } else if (ratio < 1.05) {
      tags.push("성공 가능 높음");
      if (mission && mission.jackpotChance > 0) {
        tags.push("잭팟 극소 확률");
      }
      summary = "예상 결과: 성공 중심";
      resultBand = ["success", "great"];
    } else if (ratio < 1.2) {
      tags.push("대성공 가능 있음");
      if (mission && mission.jackpotChance > 0) {
        tags.push("잭팟 극소 확률");
      }
      summary = "예상 결과: 성공 ~ 대성공";
      resultBand = ["success", "great", "jackpot"];
    } else {
      tags.push("대성공 가능 높음");
      if (mission && mission.jackpotChance > 0) {
        tags.push("잭팟 극소 확률");
      }
      summary = "예상 결과: 대성공 중심";
      resultBand = ["great", "jackpot"];
    }

    return {
      summary,
      tags,
      resultBand,
      snapshot,
      rewardPreview: buildRewardPreview(mission, snapshot, resultBand)
    };
  }

  function buildConsumableReward(productId) {
    const product = (InventoryService.SHOP_CATALOG || []).find((entry) => entry.id === productId);
    return product ? InventoryService.createRewardItem(product) : null;
  }

  function buildEquipmentReward(mission, levelBonus, extraQualityBias) {
    const enemyLevel = Math.max(1, mission.starRating * 2 + Number(levelBonus || 0));
    return InventoryService.createLootDrop(enemyLevel, {
      qualityBias: Math.max(0, Number(mission.qualityBias || 0) + Number(extraQualityBias || 0))
    });
  }

  function buildRefineStoneReward(quantity) {
    const amount = Math.max(0, Math.floor(Number(quantity || 0)));
    return amount > 0 ? InventoryService.createMiscItemStack("refine-stone-basic", amount) : null;
  }

  function getMissionResultByRatio(mission, ratio) {
    if (ratio >= 1.2 && Math.random() < Number(mission.jackpotChance || 0)) {
      return "jackpot";
    }

    if (ratio < 0.75) {
      return "fail";
    }

    if (ratio >= 1.05) {
      return "great";
    }

    return "success";
  }

  function buildMissionRewards(activeMission, resultKey) {
    const mission = activeMission;
    const scaling = getRewardScalingContext(mission, activeMission.dispatchSnapshot);
    const profile = getRewardOutcomeProfile(resultKey);
    const goldRoll = getRandomIntInclusive(mission.goldRange[0], mission.goldRange[1]);
    const expRoll = getRandomIntInclusive(mission.expRange[0], mission.expRange[1]);
    const items = [];
    let goldMultiplier = profile.goldMultiplier;
    let expMultiplier = profile.expMultiplier;
    let equipmentChance = resultKey === "jackpot"
      ? 1
      : clamp(Number(mission.equipmentChance || 0) + scaling.equipmentChanceBonus + profile.equipmentChanceBonus, 0, 1);
    let refineStoneChance = resultKey === "jackpot"
      ? 1
      : clamp(Number(mission.refineStoneChance || 0) + scaling.consumableChanceBonus * 0.45 + profile.refineStoneChanceBonus, 0, 1);
    let resultLog = chooseSuccessLog();

    if (resultKey === "fail") {
      equipmentChance = 0;
      resultLog = chooseFailureLog();

      if (Math.random() < 0.3) {
        const fallbackConsumable = buildConsumableReward("shop-potion");
        if (fallbackConsumable) {
          items.push(fallbackConsumable);
        }
      }
    } else if (resultKey === "great") {
      resultLog = chooseGreatLog();
    } else if (resultKey === "jackpot") {
      resultLog = chooseJackpotLog();
    }

    const gold = Math.max(0, Math.round(goldRoll * scaling.rewardScale * goldMultiplier));
    const expPerUnit = Math.max(1, Math.round(expRoll * scaling.rewardScale * expMultiplier));

    if (resultKey === "jackpot") {
      const jackpotRefineStone = buildRefineStoneReward(getRandomIntInclusive(2, 4));
      if (jackpotRefineStone) {
        items.push(jackpotRefineStone);
      }

      const firstReward = buildEquipmentReward(mission, 2 + scaling.rewardLevelBonus, 0.08 + scaling.equipmentChanceBonus * 0.2);
      const secondReward = buildEquipmentReward(mission, 2 + scaling.rewardLevelBonus, 0.1 + scaling.equipmentChanceBonus * 0.24);

      if (firstReward) {
        items.push(firstReward);
      }

      if (secondReward) {
        items.push(secondReward);
      }

      const jackpotConsumable = buildConsumableReward("shop-hi-potion");
      if (jackpotConsumable) {
        items.push(jackpotConsumable);
      }
    } else {
      if (Math.random() < equipmentChance) {
        const equipmentReward = buildEquipmentReward(
          mission,
          (resultKey === "great" ? 1 : 0) + scaling.rewardLevelBonus,
          (resultKey === "great" ? 0.03 : 0) + scaling.equipmentChanceBonus * 0.12
        );
        if (equipmentReward) {
          items.push(equipmentReward);
        }
      }

      const consumablePool = mission.consumablePool || [];
      const consumableDropChance = resultKey === "jackpot"
        ? 1
        : clamp(profile.consumableChance + scaling.consumableChanceBonus, 0, 1);

      if (consumablePool.length && Math.random() < consumableDropChance) {
        const consumableReward = buildConsumableReward(chooseRandomEntry(consumablePool));
        if (consumableReward) {
          items.push(consumableReward);
        }
      }

      if (Math.random() < refineStoneChance) {
        const refineStoneReward = buildRefineStoneReward(
          refineStoneChance >= 0.58 && Math.random() < 0.22 ? 2 : 1
        );
        if (refineStoneReward) {
          items.push(refineStoneReward);
        }
      }
    }

    return {
      gold,
      expPerUnit,
      items,
      resultLog
    };
  }

  function appendRecentLog(dispatch, mission, resultKey, resultLog, rewards) {
    dispatch.recentDispatchLogs = dispatch.recentDispatchLogs || [];
    dispatch.recentDispatchLogs.unshift({
      id: `${mission.id}-${Date.now()}`,
      missionName: mission.missionName,
      result: resultKey,
      completedAt: new Date().toISOString(),
      text: resultLog,
      gold: rewards.gold,
      expPerUnit: rewards.expPerUnit,
      itemCount: (rewards.items || []).length
    });
    dispatch.recentDispatchLogs = dispatch.recentDispatchLogs.slice(0, MAX_RECENT_LOG_COUNT);
  }

  function resolveCompletedMission(saveData, activeMission) {
    const ratio = Number(activeMission.dispatchSnapshot && activeMission.dispatchSnapshot.partyDispatchPower || 0)
      / Math.max(1, Number(activeMission.requiredPower || 1));
    const result = getMissionResultByRatio(activeMission, ratio + (Math.random() * 0.08 - 0.02));
    const rewards = buildMissionRewards(activeMission, result);

    return {
      id: activeMission.id,
      missionType: activeMission.missionType,
      missionName: activeMission.missionName,
      starRating: activeMission.starRating,
      durationHours: activeMission.durationHours,
      unitIds: (activeMission.unitIds || []).slice(),
      result,
      rewards,
      completedAt: new Date().toISOString(),
      expectedReturnAt: activeMission.expectedReturnAt,
      resultLog: rewards.resultLog
    };
  }

  function syncDispatch(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    let changed = false;
    let completedCount = 0;
    const now = Date.now();
    const remainingActive = [];

    (dispatch.activeMissions || []).forEach((mission) => {
      if (new Date(mission.expectedReturnAt).getTime() <= now) {
        const completedMission = resolveCompletedMission(saveData, mission);
        dispatch.completedMissions.push(completedMission);
        appendRecentLog(dispatch, mission, completedMission.result, completedMission.resultLog, completedMission.rewards);
        completedCount += 1;
        changed = true;
        return;
      }

      remainingActive.push(mission);
    });

    dispatch.activeMissions = remainingActive;
    dispatch.reservedUnitIds = Array.from(new Set(
      dispatch.activeMissions
        .flatMap((mission) => Array.isArray(mission.unitIds) ? mission.unitIds : [])
        .filter(Boolean)
    ));

    if (Array.isArray(saveData.selectedPartyIds) && dispatch.reservedUnitIds.length) {
      const filteredPartyIds = saveData.selectedPartyIds.filter((unitId) => !dispatch.reservedUnitIds.includes(unitId));
      if (filteredPartyIds.length !== saveData.selectedPartyIds.length) {
        saveData.selectedPartyIds = filteredPartyIds;
        changed = true;
      }
    }

    if ((dispatch.availableMissions || []).length < AVAILABLE_MISSION_COUNT) {
      fillAvailableMissions(saveData);
      changed = true;
    }

    return {
      dispatch,
      changed,
      completedCount
    };
  }

  function useRefresh(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    const refreshState = getRefreshState(saveData);

    if (refreshState.remaining <= 0) {
      throw new Error("오늘 사용할 수 있는 임무 갱신 횟수를 모두 소진했습니다.");
    }

    dispatch.refreshCount += 1;
    dispatch.availableMissions = [];
    fillAvailableMissions(saveData);

    return {
      dispatch,
      refreshState: getRefreshState(saveData)
    };
  }

  function startMission(saveData, missionId, unitIds) {
    const dispatch = ensureDispatchShape(saveData);
    const mission = (dispatch.availableMissions || []).find((entry) => entry.id === missionId);
    const selectedUnitIds = Array.from(new Set((unitIds || []).filter(Boolean)));

    if (!mission) {
      throw new Error("파견할 임무를 찾을 수 없습니다.");
    }

    if (selectedUnitIds.length < MIN_DISPATCH_PARTY_SIZE) {
      throw new Error(`파견에는 최소 ${MIN_DISPATCH_PARTY_SIZE}명의 모험가가 필요합니다.`);
    }

    if (selectedUnitIds.length > MAX_DISPATCH_PARTY_SIZE) {
      throw new Error(`파견에는 최대 ${MAX_DISPATCH_PARTY_SIZE}명까지만 보낼 수 있습니다.`);
    }

    selectedUnitIds.forEach((unitId) => {
      const unit = getRosterUnit(saveData, unitId);

      if (!unit) {
        throw new Error("파견 대상 모험가를 찾을 수 없습니다.");
      }

      if (Array.isArray(saveData.selectedPartyIds) && saveData.selectedPartyIds.includes(unitId)) {
        throw new Error(`${unit.name}은(는) 현재 출전 편성에 포함되어 있어 파견할 수 없습니다.`);
      }

      if (isUnitReserved(saveData, unitId)) {
        throw new Error(`${unit.name}은(는) 이미 다른 파견을 진행 중입니다.`);
      }
    });

    const dispatchSnapshot = calculateDispatchSnapshot(saveData, selectedUnitIds);
    const startedAt = new Date().toISOString();
    const expectedReturnAt = new Date(Date.now() + mission.durationHours * 60 * 60 * 1000).toISOString();
    const activeMission = Object.assign({}, mission, {
      startedAt,
      expectedReturnAt,
      unitIds: selectedUnitIds.slice(),
      dispatchSnapshot,
      status: "active"
    });

    removeMissionById(dispatch.availableMissions, missionId);
    dispatch.activeMissions.push(activeMission);
    dispatch.reservedUnitIds = Array.from(new Set(dispatch.reservedUnitIds.concat(selectedUnitIds)));
    fillAvailableMissions(saveData);

    return activeMission;
  }

  function grantExperienceToUnit(unit, amount) {
    const expAmount = Math.max(0, Math.floor(Number(amount || 0)));
    const levelUps = [];

    if (!unit || !expAmount) {
      return levelUps;
    }

    unit.exp = Math.max(0, Number(unit.exp || 0)) + expAmount;

    while (unit.exp >= 100) {
      const previousLevel = unit.level;
      unit.exp -= 100;
      unit.level = Math.max(1, Number(unit.level || 1)) + 1;
      const gains = StatsService.rollLevelGains(unit, 5);
      StatsService.applyLevelGains(unit, gains);
      unit.statPoints = (unit.statPoints || 0) + 1;
      unit.skillPoints = (unit.skillPoints || 0) + 1;
      levelUps.push({
        level: unit.level,
        gains: StatsService.describeLevelGains(gains),
        unlockedSkills: SkillsService.getNewlyUnlockedSkills(unit.className, previousLevel, unit.level).map((skill) => skill.name)
      });
    }

    return levelUps;
  }

  function claimMission(saveData, missionId) {
    const dispatch = ensureDispatchShape(saveData);
    const mission = (dispatch.completedMissions || []).find((entry) => entry.id === missionId);

    if (!mission) {
      throw new Error("수령할 완료 임무를 찾을 수 없습니다.");
    }

    const levelUpSummaries = [];
    mission.unitIds.forEach((unitId) => {
      const unit = getRosterUnit(saveData, unitId);
      if (!unit) {
        return;
      }

      const levelUps = grantExperienceToUnit(unit, mission.rewards.expPerUnit);
      if (levelUps.length) {
        levelUpSummaries.push({
          unitId,
          unitName: unit.name,
          levels: levelUps
        });
      }
    });

    saveData.partyGold = Math.max(0, Number(saveData.partyGold || 0)) + Number(mission.rewards.gold || 0);

    (mission.rewards.items || []).forEach((item) => {
      InventoryService.addItemToInventory(saveData, item);
    });

    removeMissionById(dispatch.completedMissions, missionId);

    return {
      mission,
      levelUpSummaries
    };
  }

  function claimAllCompleted(saveData) {
    const dispatch = ensureDispatchShape(saveData);
    const completedIds = (dispatch.completedMissions || []).map((mission) => mission.id);
    const claimedMissions = [];
    const levelUpSummaries = [];

    completedIds.forEach((missionId) => {
      const result = claimMission(saveData, missionId);
      claimedMissions.push(result.mission);
      if (result.levelUpSummaries.length) {
        levelUpSummaries.push.apply(levelUpSummaries, result.levelUpSummaries);
      }
    });

    return {
      claimedMissions,
      levelUpSummaries
    };
  }

  global.DispatchService = {
    AVAILABLE_MISSION_COUNT,
    DAILY_REFRESH_LIMIT,
    MIN_DISPATCH_PARTY_SIZE,
    MAX_DISPATCH_PARTY_SIZE,
    syncDispatch,
    getRefreshState,
    useRefresh,
    getAvailableUnits,
    getReservedUnitIds,
    isUnitReserved,
    calculateDispatchSnapshot,
    calculateUnitDispatchPower,
    getMissionOutcomePreview,
    buildRewardPreview,
    startMission,
    claimMission,
    claimAllCompleted
  };
})(window);
