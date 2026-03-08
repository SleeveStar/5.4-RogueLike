/* 역할: 무기 사거리, 명중률, 피해량, 전투 결과 계산을 담당한다. */

(function attachCombatService(global) {
  const SkillsService = global.SkillsService;
  const MAGIC_WEAPON_TYPES = ["focus", "staff"];
  const TERRAIN_MODIFIERS = {
    plain: { avoid: 0, defense: 0, moveCost: 1 },
    forest: { avoid: 12, defense: 1, moveCost: 2 },
    hill: { avoid: 8, defense: 1, moveCost: 2 },
    wall: { avoid: 0, defense: 0, moveCost: Infinity }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getTerrainModifier(tileType) {
    return TERRAIN_MODIFIERS[tileType] || TERRAIN_MODIFIERS.plain;
  }

  function getElevationModifier(attackerElevation, defenderElevation) {
    const elevationDelta = (attackerElevation || 0) - (defenderElevation || 0);

    if (elevationDelta === 0) {
      return {
        delta: 0,
        hitBonus: 0,
        damageBonus: 0,
        note: ""
      };
    }

    const normalizedDelta = Math.max(-2, Math.min(2, elevationDelta));

    return {
      delta: normalizedDelta,
      hitBonus: normalizedDelta * 10,
      damageBonus: normalizedDelta > 0 ? normalizedDelta : 0,
      note: normalizedDelta > 0 ? "고지 우세" : "저지 열세"
    };
  }

  function getWeapon(unit) {
    return unit && unit.weapon ? unit.weapon : null;
  }

  function isMagicWeapon(weapon) {
    return !!weapon && MAGIC_WEAPON_TYPES.includes(weapon.type);
  }

  function hasAilment(unit) {
    return (unit && unit.statusEffects || []).some((effect) => effect && effect.kind === "ailment");
  }

  function getEffectiveWeaponRange(unit, context) {
    const weapon = getWeapon(unit);

    if (!weapon) {
      return {
        rangeMin: 0,
        rangeMax: 0,
        bonus: 0
      };
    }

    const attackerTileType = context && context.attackerTileType;
    const attackerElevation = context && context.attackerElevation || 0;
    const defenderElevation = context && context.defenderElevation || 0;
    const rangedHighGroundBonus = weapon.type === "bow" && (attackerTileType === "hill" || attackerElevation > defenderElevation) ? 1 : 0;
    const hiddenRangeBonus = Math.max(0, Number(unit && unit.hiddenStats && unit.hiddenStats.rangeBonus || 0));

    return {
      rangeMin: weapon.rangeMin,
      rangeMax: weapon.rangeMax + rangedHighGroundBonus + hiddenRangeBonus,
      bonus: rangedHighGroundBonus + hiddenRangeBonus
    };
  }

  function getDistance(fromPosition, toPosition) {
    return Math.abs(fromPosition.x - toPosition.x) + Math.abs(fromPosition.y - toPosition.y);
  }

  function getRangeDistance(fromPosition, toPosition) {
    return Math.max(Math.abs(fromPosition.x - toPosition.x), Math.abs(fromPosition.y - toPosition.y));
  }

  function getWeaponRangeDistance(unit, fromPosition, toPosition) {
    const weapon = getWeapon(unit);
    const dx = Math.abs(fromPosition.x - toPosition.x);
    const dy = Math.abs(fromPosition.y - toPosition.y);
    const baseDistance = Math.max(dx, dy);

    if (weapon && weapon.type === "bow" && dx > 0 && dy > 0) {
      return baseDistance + 1;
    }

    return baseDistance;
  }

  function isInWeaponRange(unit, origin, targetPosition, context) {
    const weapon = getWeapon(unit);

    if (!weapon || weapon.uses <= 0) {
      return false;
    }

    const effectiveRange = getEffectiveWeaponRange(unit, context);
    const distance = getWeaponRangeDistance(unit, origin, targetPosition);
    const effectiveMin = effectiveRange.rangeMax > 1 ? 1 : effectiveRange.rangeMin;
    return distance >= effectiveMin && distance <= effectiveRange.rangeMax;
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
    const elevationModifier = getElevationModifier(context.attackerElevation, context.defenderElevation);
    const distance = getWeaponRangeDistance(attacker, { x: attacker.x, y: attacker.y }, { x: defender.x, y: defender.y });
    const effectiveRange = getEffectiveWeaponRange(attacker, context);
    const forestRangedAvoidBonus = context.defenderTileType === "forest" && distance >= 2 ? 6 : 0;
    const attackerHidden = attacker.hiddenStats || {};
    const defenderHidden = defender.hiddenStats || {};
    const usesMagic = context && context.damageType === "magic"
      ? true
      : context && context.damageType === "physical"
        ? false
        : isMagicWeapon(weapon);
    const manaSurgeBonus = usesMagic
      ? Math.floor(Number(attackerHidden.maxMana || 0) / 18) + Math.floor(Number(attackerHidden.manaRegen || 0) / 2)
      : 0;
    const manaWardBonus = usesMagic
      ? Math.floor(Number(defenderHidden.maxMana || 0) / 30)
      : 0;
    const skillModifiers = SkillsService.getCombatModifiers({
      attacker,
      defender,
      weapon,
      distance,
      attackerTileType: context.attackerTileType,
      defenderTileType: context.defenderTileType,
      phase: context.phase || "player",
      isInitiator: context.isInitiator !== false
    });
    const attackPower = (
      (usesMagic ? (attackerHidden.magicAttack || attacker.skl) : (attackerHidden.physicalAttack || attacker.str))
      + weapon.might
      + manaSurgeBonus
      + skillModifiers.attackPowerBonus
      + elevationModifier.damageBonus
    );
    const defensePower = (
      (usesMagic ? (defenderHidden.magicDefense || defender.def) : (defenderHidden.physicalDefense || defender.def))
      + manaWardBonus
      + defenderTerrain.defense
      + skillModifiers.defenseBonus
    );
    const rawHit = weapon.hit
      + (attackerHidden.accuracy || (attacker.skl * 5 + attacker.spd * 2))
      + elevationModifier.hitBonus
      + skillModifiers.hitBonus
      - ((defenderHidden.evasion || (defender.spd * 3 + defender.skl * 2)) + defenderTerrain.avoid + forestRangedAvoidBonus + skillModifiers.avoidBonus);
    const critRate = clamp((attackerHidden.critChance || 0) - Math.floor((defenderHidden.critChance || 0) * 0.25), 0, 65);
    const critMultiplier = Number(attackerHidden.critMultiplier || 1.5) + Number(attackerHidden.critDamageBonus || 0);
    const isFirstStrike = Number(attacker.turnAttackCount || 0) <= 0;
    const damagePercentBonus =
      (usesMagic ? Number(attackerHidden.magicDamagePercent || 0) : Number(attackerHidden.physicalDamagePercent || 0))
      + (defender.isBoss ? Number(attackerHidden.bossDamagePercent || 0) : 0)
      + (isFirstStrike ? Number(attackerHidden.firstStrikeDamagePercent || 0) : 0)
      + (Number(attacker.turnAttackCount || 0) > 0 ? Number(attackerHidden.comboStrikeDamagePercent || 0) : 0)
      + (context && context.isCounter ? Number(attackerHidden.counterDamagePercent || 0) : 0)
      + (attacker.movedThisTurn ? Number(attackerHidden.moveThenAttackDamagePercent || 0) : 0)
      + (attacker.hp <= Math.ceil(attacker.maxHp / 2) ? Number(attackerHidden.lowHpAttackPercent || 0) : 0)
      + (defender.hp <= Math.ceil(defender.maxHp / 2) ? Number(attackerHidden.executeDamagePercent || 0) : 0)
      + (hasAilment(defender) ? Number(attackerHidden.statusTargetDamagePercent || 0) : 0);
    const mitigationPercent =
      Number(defenderHidden.damageReductionPercent || 0)
      + (Number(defenderHidden.blockChance || 0) * 0.35);
    const baseDamage = Math.max(0, attackPower - defensePower);
    const damageAfterBonus = Math.round(baseDamage * (1 + Math.max(0, damagePercentBonus)));
    const finalDamage = Math.max(0, Math.round(damageAfterBonus * (1 - Math.min(0.8, Math.max(0, mitigationPercent)))));

    return {
      canAttack: true,
      hitRate: clamp(rawHit, 5, 100),
      damage: finalDamage,
      critRate,
      critMultiplier,
      critDamage: Math.max(0, Math.round(finalDamage * critMultiplier)),
      damageType: usesMagic ? "magic" : "physical",
      weaponUsesLeft: weapon.uses,
      effectiveRangeMax: effectiveRange.rangeMax,
      rangeBonus: effectiveRange.bonus,
      attackerAvoidBonus: attackerTerrain.avoid,
      defenderDefenseBonus: defenderTerrain.defense,
      forestAvoidBonus: forestRangedAvoidBonus,
      elevationDelta: elevationModifier.delta,
      elevationNote: elevationModifier.note,
      damagePercentBonus,
      mitigationPercent,
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
    const critRoll = Math.floor(Math.random() * 100) + 1;
    const didCrit = didHit && critRoll <= preview.critRate;
    const damageDealt = didHit ? (didCrit ? preview.critDamage : preview.damage) : 0;
    const weapon = getWeapon(attacker);

    weapon.uses = Math.max(0, weapon.uses - 1);
    defender.hp = Math.max(0, defender.hp - damageDealt);
    attacker.turnAttackCount = Number(attacker.turnAttackCount || 0) + 1;

    return {
      canAttack: true,
      didHit,
      didCrit,
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
    getEffectiveWeaponRange,
    calculatePreview,
    resolveAttack,
    getTerrainModifier,
    getElevationModifier,
    isMagicWeapon
  };
})(window);
