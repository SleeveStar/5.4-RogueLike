/* 역할: 무기 사거리, 명중률, 피해량, 전투 결과 계산을 담당한다. */

(function attachCombatService(global) {
  const SkillsService = global.SkillsService;
  const TERRAIN_MODIFIERS = {
    plain: { avoid: 0, defense: 0 },
    forest: { avoid: 12, defense: 1 },
    wall: { avoid: 0, defense: 0 }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getTerrainModifier(tileType) {
    return TERRAIN_MODIFIERS[tileType] || TERRAIN_MODIFIERS.plain;
  }

  function getWeapon(unit) {
    return unit && unit.weapon ? unit.weapon : null;
  }

  function getDistance(fromPosition, toPosition) {
    return Math.abs(fromPosition.x - toPosition.x) + Math.abs(fromPosition.y - toPosition.y);
  }

  function isInWeaponRange(unit, origin, targetPosition) {
    const weapon = getWeapon(unit);

    if (!weapon || weapon.uses <= 0) {
      return false;
    }

    const distance = getDistance(origin, targetPosition);
    return distance >= weapon.rangeMin && distance <= weapon.rangeMax;
  }

  function calculatePreview(attacker, defender, context) {
    const weapon = getWeapon(attacker);

    if (!weapon || weapon.uses <= 0) {
      return {
        canAttack: false,
        hitRate: 0,
        damage: 0,
        weaponUsesLeft: 0
      };
    }

    const attackerTerrain = getTerrainModifier(context.attackerTileType);
    const defenderTerrain = getTerrainModifier(context.defenderTileType);
    const distance = getDistance({ x: attacker.x, y: attacker.y }, { x: defender.x, y: defender.y });
    const skillModifiers = SkillsService.getCombatModifiers({
      attacker,
      defender,
      weapon,
      distance,
      attackerTileType: context.attackerTileType,
      defenderTileType: context.defenderTileType,
      phase: context.phase || "player",
      isInitiator: true
    });
    const attackPower = attacker.str + weapon.might + skillModifiers.attackPowerBonus;
    const defensePower = defender.def + defenderTerrain.defense + skillModifiers.defenseBonus;
    const rawHit = weapon.hit
      + attacker.skl * 5
      + attacker.spd * 2
      + skillModifiers.hitBonus
      - (defender.spd * 3 + defender.skl * 2 + defenderTerrain.avoid + skillModifiers.avoidBonus);

    return {
      canAttack: true,
      hitRate: clamp(rawHit, 5, 100),
      damage: Math.max(0, attackPower - defensePower),
      weaponUsesLeft: weapon.uses,
      attackerAvoidBonus: attackerTerrain.avoid,
      defenderDefenseBonus: defenderTerrain.defense,
      triggeredSkills: skillModifiers.triggeredSkills
    };
  }

  function resolveAttack(attacker, defender, context) {
    const preview = calculatePreview(attacker, defender, context);

    if (!preview.canAttack) {
      return {
        canAttack: false,
        didHit: false,
        damageDealt: 0,
        targetDefeated: false,
        expGained: 0,
        preview
      };
    }

    const roll = Math.floor(Math.random() * 100) + 1;
    const didHit = roll <= preview.hitRate;
    const damageDealt = didHit ? preview.damage : 0;
    const weapon = getWeapon(attacker);

    weapon.uses = Math.max(0, weapon.uses - 1);
    defender.hp = Math.max(0, defender.hp - damageDealt);

    return {
      canAttack: true,
      didHit,
      damageDealt,
      targetDefeated: defender.hp <= 0,
      expGained: didHit ? (defender.hp <= 0 ? 35 : 12) : 5,
      roll,
      preview
    };
  }

  global.CombatService = {
    getDistance,
    isInWeaponRange,
    calculatePreview,
    resolveAttack,
    getTerrainModifier
  };
})(window);
