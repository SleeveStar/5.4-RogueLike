/* 역할: 캐릭터의 수동 스탯 분배 규칙을 담당한다. */

(function attachStatsService(global) {
  const ALLOCATABLE_STATS = ["maxHp", "str", "skl", "spd", "def", "mov"];
  const STAT_LIMITS = {
    maxHp: 40,
    str: 30,
    skl: 30,
    spd: 30,
    def: 30,
    mov: 8
  };

  function getUnitById(saveData, unitId) {
    return (saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function allocateStatPoint(saveData, unitId, statName) {
    const unit = getUnitById(saveData, unitId);

    if (!unit) {
      throw new Error("스탯을 올릴 유닛을 찾을 수 없습니다.");
    }

    if (!ALLOCATABLE_STATS.includes(statName)) {
      throw new Error("분배할 수 없는 스탯입니다.");
    }

    if ((unit.statPoints || 0) <= 0) {
      throw new Error("남은 스탯 포인트가 없습니다.");
    }

    const limit = STAT_LIMITS[statName];

    if (unit[statName] >= limit) {
      throw new Error("이 스탯은 더 이상 올릴 수 없습니다.");
    }

    unit[statName] += 1;
    unit.statPoints -= 1;

    if (statName === "maxHp") {
      unit.hp = Math.min(unit.maxHp, (unit.hp || unit.maxHp) + 1);
    }

    return unit;
  }

  global.StatsService = {
    ALLOCATABLE_STATS,
    allocateStatPoint
  };
})(window);
