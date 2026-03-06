/* 역할: 아이템 희귀도, 장비 가능 여부, 드롭 생성, 파티 인벤토리 장착 처리를 담당한다. */

(function attachInventoryService(global) {
  const StorageService = global.StorageService;

  const RARITY_ORDER = [
    "common",
    "uncommon",
    "rare",
    "unique",
    "legendary",
    "epic",
    "mystic"
  ];

  const RARITY_META = {
    common: { label: "커먼", colorVar: "--common", weight: 46 },
    uncommon: { label: "언커먼", colorVar: "--uncommon", weight: 24 },
    rare: { label: "레어", colorVar: "--rare", weight: 14 },
    unique: { label: "유니크", colorVar: "--unique", weight: 8 },
    legendary: { label: "레전더리", colorVar: "--legendary", weight: 5 },
    epic: { label: "에픽", colorVar: "--epic", weight: 2.2 },
    mystic: { label: "미스틱", colorVar: "--mystic", weight: 0.8 }
  };

  const CLASS_WEAPONS = {
    로드: ["sword"],
    하이로드: ["sword"],
    랜서: ["lance"],
    팔라딘: ["lance"],
    아처: ["bow"],
    스나이퍼: ["bow"],
    검사: ["sword"],
    브리건드: ["axe"],
    헌터: ["bow"],
    솔저: ["lance"]
  };

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
        mystic: "심연검"
      },
      slot: "weapon",
      type: "sword",
      base: { might: 5, hit: 86, rangeMin: 1, rangeMax: 1, uses: 35 }
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
        mystic: "멸망창"
      },
      slot: "weapon",
      type: "lance",
      base: { might: 6, hit: 80, rangeMin: 1, rangeMax: 1, uses: 32 }
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
        mystic: "재앙 활"
      },
      slot: "weapon",
      type: "bow",
      base: { might: 5, hit: 88, rangeMin: 2, rangeMax: 2, uses: 30 }
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
        mystic: "혈월 도끼"
      },
      slot: "weapon",
      type: "axe",
      base: { might: 7, hit: 74, rangeMin: 1, rangeMax: 1, uses: 28 }
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
      id: "shop-iron-sword",
      name: "철검 보급품",
      type: "sword",
      slot: "weapon",
      rarity: "common",
      price: 120,
      description: "로드와 검사 계열이 사용할 수 있는 표준 검.",
      might: 6,
      hit: 88,
      rangeMin: 1,
      rangeMax: 1,
      uses: 36
    },
    {
      id: "shop-iron-lance",
      name: "철창 보급품",
      type: "lance",
      slot: "weapon",
      rarity: "common",
      price: 128,
      description: "랜서와 솔저 계열이 사용할 수 있는 표준 창.",
      might: 7,
      hit: 80,
      rangeMin: 1,
      rangeMax: 1,
      uses: 34
    },
    {
      id: "shop-hunter-bow",
      name: "사냥 활 보급품",
      type: "bow",
      slot: "weapon",
      rarity: "common",
      price: 124,
      description: "아처와 헌터 계열이 사용할 수 있는 활.",
      might: 6,
      hit: 86,
      rangeMin: 2,
      rangeMax: 2,
      uses: 32
    },
    {
      id: "shop-guardian-charm",
      name: "수호 부적",
      type: "accessory",
      slot: "accessory",
      rarity: "rare",
      price: 160,
      description: "방어를 1 높여 주는 보조 장비.",
      statBonus: { def: 1 }
    }
  ];

  function getRarityMeta(rarity) {
    return RARITY_META[rarity] || RARITY_META.common;
  }

  function getClassWeaponTypes(className) {
    return CLASS_WEAPONS[className] || ["sword"];
  }

  function getItemById(saveData, itemId) {
    return (saveData.inventory || []).find((item) => item.id === itemId) || null;
  }

  function getUnitById(saveData, unitId) {
    return (saveData.roster || []).find((unit) => unit.id === unitId) || null;
  }

  function canEquip(unit, item) {
    if (!unit || !item) {
      return false;
    }

    if (isConsumable(item)) {
      return false;
    }

    if (item.slot !== "weapon") {
      return true;
    }

    return getClassWeaponTypes(unit.className).includes(item.type);
  }

  function isConsumable(item) {
    return !!item && item.slot === "consumable" && !!item.effect;
  }

  function syncEquippedItems(saveData, unitId) {
    const unit = getUnitById(saveData, unitId);

    if (!unit) {
      return;
    }

    unit.equippedItemIds = (saveData.inventory || [])
      .filter((item) => item.equippedBy === unitId)
      .map((item) => item.id);

    const equippedWeapon = (saveData.inventory || []).find(
      (item) => item.equippedBy === unitId && item.slot === "weapon"
    );

    unit.weapon = equippedWeapon ? equippedWeapon.id : null;
  }

  function equipItemToUnit(saveData, unitId, itemId) {
    const unit = getUnitById(saveData, unitId);
    const item = getItemById(saveData, itemId);
    const previousOwnerId = item ? item.equippedBy : null;

    if (!unit || !item) {
      throw new Error("장착 대상 유닛 또는 아이템을 찾을 수 없습니다.");
    }

    if (isConsumable(item)) {
      throw new Error("소모품은 장착할 수 없습니다.");
    }

    if (!canEquip(unit, item)) {
      throw new Error(`${unit.className}은 ${item.type} 무기를 장착할 수 없습니다.`);
    }

    (saveData.inventory || []).forEach((entry) => {
      if (entry.slot === item.slot && entry.equippedBy === unitId) {
        entry.equippedBy = null;
      }
    });

    item.equippedBy = unitId;
    syncEquippedItems(saveData, unitId);

    if (previousOwnerId && previousOwnerId !== unitId) {
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

    if (previousOwnerId) {
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
        const typeCompare = String(left.type || left.slot).localeCompare(String(right.type || right.slot), "ko");

        if (typeCompare !== 0) {
          return typeCompare;
        }
      }

      if (mode === "equipped") {
        if (!!left.equippedBy !== !!right.equippedBy) {
          return left.equippedBy ? -1 : 1;
        }
      }

      return String(left.name).localeCompare(String(right.name), "ko");
    });

    return source;
  }

  function filterInventory(items, options) {
    const nextOptions = options || {};

    return (items || []).filter((item) => {
      if (nextOptions.type && nextOptions.type !== "all" && (item.type || item.slot) !== nextOptions.type) {
        return false;
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

  function addItemToInventory(saveData, item) {
    saveData.inventory = saveData.inventory || [];
    saveData.inventory.push(StorageService.cloneValue(item));
    return item;
  }

  function removeItemFromInventory(saveData, itemId) {
    saveData.inventory = (saveData.inventory || []).filter((item) => item.id !== itemId);
  }

  function buildShopItem(productId) {
    const product = SHOP_CATALOG.find((entry) => entry.id === productId);

    if (!product) {
      throw new Error("구매할 수 없는 상품입니다.");
    }

    return Object.assign({}, StorageService.cloneValue(product), {
      id: `${product.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      shopId: product.id,
      equippedBy: null
    });
  }

  function purchaseItem(saveData, productId) {
    const product = SHOP_CATALOG.find((entry) => entry.id === productId);

    if (!product) {
      throw new Error("상품 정보를 찾을 수 없습니다.");
    }

    if ((saveData.partyGold || 0) < product.price) {
      throw new Error("골드가 부족합니다.");
    }

    const item = buildShopItem(productId);
    saveData.partyGold -= product.price;
    addItemToInventory(saveData, item);
    return item;
  }

  function applyConsumableToUnit(saveData, unit, itemId) {
    const item = getItemById(saveData, itemId);

    if (!unit || !item || !isConsumable(item)) {
      throw new Error("사용할 수 없는 소모품입니다.");
    }

    if (item.effect.kind === "heal") {
      if (unit.hp >= unit.maxHp) {
        throw new Error("이미 HP가 최대입니다.");
      }

      const healed = Math.min(item.effect.amount, unit.maxHp - unit.hp);
      unit.hp += healed;
      removeItemFromInventory(saveData, itemId);
      return {
        item,
        healed
      };
    }

    throw new Error("지원하지 않는 소모품 효과입니다.");
  }

  function chooseWeightedRarity() {
    const totalWeight = RARITY_ORDER.reduce((sum, rarity) => sum + getRarityMeta(rarity).weight, 0);
    let roll = Math.random() * totalWeight;

    for (let index = 0; index < RARITY_ORDER.length; index += 1) {
      const rarity = RARITY_ORDER[index];
      roll -= getRarityMeta(rarity).weight;

      if (roll <= 0) {
        return rarity;
      }
    }

    return "common";
  }

  function buildLootStats(template, rarity, enemyLevel) {
    const rarityIndex = Math.max(0, RARITY_ORDER.indexOf(rarity));
    const powerBonus = rarityIndex + Math.max(0, enemyLevel - 1);
    return {
      might: template.base.might + Math.floor(powerBonus / 2),
      hit: template.base.hit + Math.min(10, rarityIndex * 2),
      rangeMin: template.base.rangeMin,
      rangeMax: template.base.rangeMax,
      uses: template.base.uses + rarityIndex * 3
    };
  }

  function createLootDrop(enemyLevel) {
    const rarity = chooseWeightedRarity();
    const template = LOOT_TEMPLATES[Math.floor(Math.random() * LOOT_TEMPLATES.length)];
    const stats = buildLootStats(template, rarity, enemyLevel || 1);

    return {
      id: `loot-${template.key}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: template.names[rarity],
      slot: template.slot,
      type: template.type,
      rarity,
      equippedBy: null,
      might: stats.might,
      hit: stats.hit,
      rangeMin: stats.rangeMin,
      rangeMax: stats.rangeMax,
      uses: stats.uses
    };
  }

  function createRewardItem(rewardDefinition) {
    if (!rewardDefinition) {
      throw new Error("보상 아이템 정보가 없습니다.");
    }

    return Object.assign({}, StorageService.cloneValue(rewardDefinition), {
      id: `${rewardDefinition.idPrefix || rewardDefinition.type || rewardDefinition.slot}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      equippedBy: null
    });
  }

  function describeItem(item) {
    if (!item) {
      return "없음";
    }

    const rarityLabel = getRarityMeta(item.rarity).label;
    const statLine = item.slot === "weapon"
      ? `위력 ${item.might} / 명중 ${item.hit} / 사거리 ${item.rangeMin}-${item.rangeMax} / 내구 ${item.uses}`
      : "보조 장비";

    return `${item.name} [${rarityLabel}] ${statLine}`;
  }

  global.InventoryService = {
    RARITY_ORDER,
    RARITY_META,
    CLASS_WEAPONS,
    SHOP_CATALOG,
    getRarityMeta,
    getClassWeaponTypes,
    getItemById,
    getUnitById,
    canEquip,
    isConsumable,
    equipItemToUnit,
    unequipItem,
    addItemToInventory,
    removeItemFromInventory,
    buildShopItem,
    purchaseItem,
    applyConsumableToUnit,
    sortInventory,
    filterInventory,
    createLootDrop,
    createRewardItem,
    describeItem,
    syncEquippedItems
  };
})(window);
