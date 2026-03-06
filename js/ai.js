/* 역할: 적 유닛이 가장 가까운 아군에게 접근하고 가능하면 공격하는 간단한 AI 결정을 담당한다. */

(function attachAIService(global) {
  function chooseClosestTarget(enemy, allies) {
    let bestTarget = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    allies.forEach((ally) => {
      const distance = Math.abs(enemy.x - ally.x) + Math.abs(enemy.y - ally.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = ally;
      }
    });

    return bestTarget;
  }

  function chooseAttackOption(attackOptions) {
    if (!attackOptions.length) {
      return null;
    }

    const sorted = attackOptions.slice().sort((left, right) => {
      if (!!left.wouldDefeat !== !!right.wouldDefeat) {
        return left.wouldDefeat ? -1 : 1;
      }

      if ((left.estimatedDamage || 0) !== (right.estimatedDamage || 0)) {
        return (right.estimatedDamage || 0) - (left.estimatedDamage || 0);
      }

      if ((left.hitRate || 0) !== (right.hitRate || 0)) {
        return (right.hitRate || 0) - (left.hitRate || 0);
      }

      if ((left.terrainAdvantage || 0) !== (right.terrainAdvantage || 0)) {
        return (right.terrainAdvantage || 0) - (left.terrainAdvantage || 0);
      }

      if ((left.rangeBonus || 0) !== (right.rangeBonus || 0)) {
        return (right.rangeBonus || 0) - (left.rangeBonus || 0);
      }

      if (left.target.hp !== right.target.hp) {
        return left.target.hp - right.target.hp;
      }

      return left.distanceToTarget - right.distanceToTarget;
    });

    return sorted[0];
  }

  function chooseSkillOption(skillOptions) {
    if (!skillOptions.length) {
      return null;
    }

    const sorted = skillOptions.slice().sort((left, right) => {
      if ((left.priority || 0) !== (right.priority || 0)) {
        return (right.priority || 0) - (left.priority || 0);
      }

      if (!!left.wouldDefeat !== !!right.wouldDefeat) {
        return left.wouldDefeat ? -1 : 1;
      }

      if ((left.estimatedValue || 0) !== (right.estimatedValue || 0)) {
        return (right.estimatedValue || 0) - (left.estimatedValue || 0);
      }

      if ((left.terrainAdvantage || 0) !== (right.terrainAdvantage || 0)) {
        return (right.terrainAdvantage || 0) - (left.terrainAdvantage || 0);
      }

      if ((left.hitRate || 0) !== (right.hitRate || 0)) {
        return (right.hitRate || 0) - (left.hitRate || 0);
      }

      return (left.distanceToTarget || 0) - (right.distanceToTarget || 0);
    });

    return sorted[0];
  }

  function chooseMoveTowardTarget(reachableTiles, target) {
    if (!target) {
      return null;
    }

    const sorted = reachableTiles.slice().sort((left, right) => {
      const leftDistance = Math.abs(left.x - target.x) + Math.abs(left.y - target.y);
      const rightDistance = Math.abs(right.x - target.x) + Math.abs(right.y - target.y);

      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      if ((right.elevation || 0) !== (left.elevation || 0)) {
        return (right.elevation || 0) - (left.elevation || 0);
      }

      if ((left.cost || 0) !== (right.cost || 0)) {
        return (left.cost || 0) - (right.cost || 0);
      }

      if (left.y !== right.y) {
        return left.y - right.y;
      }

      return left.x - right.x;
    });

    return sorted[0] || null;
  }

  function decideEnemyAction(context) {
    const enemy = context.enemy;
    const allies = context.allies;
    const reachableTiles = context.reachableTiles;
    const attackOptions = context.attackOptions;
    const skillOptions = context.skillOptions || [];
    const target = chooseClosestTarget(enemy, allies);
    const chosenAttack = chooseAttackOption(attackOptions);
    const chosenSkill = chooseSkillOption(skillOptions);

    if (
      chosenSkill &&
      (
        chosenSkill.effectKind !== "attack" ||
        !chosenAttack ||
        chosenSkill.wouldDefeat ||
        (chosenSkill.estimatedValue || 0) > (chosenAttack.estimatedDamage || 0)
      )
    ) {
      return {
        type: "skill",
        moveTo: chosenSkill.origin || null,
        targetId: chosenSkill.targetId || null,
        skillId: chosenSkill.skillId
      };
    }

    if (chosenAttack) {
      return {
        type: "attack",
        moveTo: chosenAttack.origin,
        targetId: chosenAttack.target.id,
        skillId: null
      };
    }

    return {
      type: "move",
      moveTo: chooseMoveTowardTarget(reachableTiles, target),
      targetId: null,
      skillId: null
    };
  }

  global.AIService = {
    decideEnemyAction
  };
})(window);
