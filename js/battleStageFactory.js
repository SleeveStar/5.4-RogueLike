/* 역할: 전투 스테이지 정의 생성과 엔드리스 층 레이아웃 계산을 담당한다. */

(function attachBattleStageFactory(global) {
  const InventoryService = global.InventoryService;
  const BattleStageData = global.BattleStageData;

  if (!InventoryService) {
    throw new Error("BattleStageFactory는 InventoryService 이후에 로드되어야 합니다.");
  }

  if (!BattleStageData) {
    throw new Error("BattleStageFactory는 BattleStageData 이후에 로드되어야 합니다.");
  }

  const {
    ENDLESS_STAGE_ID,
    RIFT_DEFENSE_STAGE_ID,
    ALLY_SPAWNS,
    ENEMY_SPAWN_CANDIDATES,
    ENDLESS_ENEMY_SPAWN_CANDIDATES,
    RIFT_DEFENSE_ENEMY_SPAWNS,
    RIFT_DEFENSE_OBJECTIVE,
    RIFT_DEFENSE_MAP_TILES,
    NON_REPEATABLE_STAGE_IDS,
    ENDLESS_STAGE_META,
    RIFT_DEFENSE_STAGE_META,
    RIFT_DEFENSE_WAVES,
    ENDLESS_RELICS,
    ENDLESS_SPECIAL_RULES,
    ENDLESS_EVENT_CHAINS,
    STAGE_DEFINITIONS,
    ENDLESS_CONTACT_EVENTS
  } = BattleStageData;

  const MAP_WIDTH = 14;
  const MAP_HEIGHT = 8;

  function createController(deps) {
    const clone = deps.clone;
    const getSaveData = deps.getSaveData;
    const ensureCampaignState = deps.ensureCampaignState;
    const ensureEndlessState = deps.ensureEndlessState;
    const ensureRiftDefenseState = deps.ensureRiftDefenseState;

    function getCurrentEndlessChainState() {
      const saveData = getSaveData();
      const endless = saveData && saveData.endless ? saveData.endless : null;
      const currentRun = endless && endless.currentRun ? endless.currentRun : null;
      return currentRun && currentRun.chainState ? clone(currentRun.chainState) : null;
    }

    function getRecentEndlessFloorTypes() {
      const saveData = getSaveData();
      const endless = saveData && saveData.endless ? saveData.endless : null;
      const currentRun = endless && endless.currentRun ? endless.currentRun : null;
      return currentRun && Array.isArray(currentRun.floorTypeHistory)
        ? currentRun.floorTypeHistory.slice()
        : [];
    }

    function isSupportFloorType(floorType) {
      return floorType === "rest" || floorType === "supply" || floorType === "shop" || floorType === "relic";
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

    function getAvailableRelicChoicesForEvent(floor, random) {
      const saveData = getSaveData();
      const ownedRelicIds = saveData && saveData.endless && saveData.endless.relicIds
        ? saveData.endless.relicIds
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
          description: "현재 층 기준의 랜덤 장비 1개를 획득한다.",
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

        if (tileType === "hill" || tileType === "ruin") {
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

    function chooseEndlessFloorType(floor, random) {
      const normalizedFloor = Math.max(1, floor || 1);
      const floorTypeHistory = getRecentEndlessFloorTypes();
      const lastFloorType = floorTypeHistory.length ? floorTypeHistory[floorTypeHistory.length - 1] : null;

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

      if (isSupportFloorType(lastFloorType)) {
        candidates.forEach((candidate) => {
          if (isSupportFloorType(candidate.type)) {
            candidate.weight = 0;
          }
        });
      }

      const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = random() * totalWeight;

      for (let index = 0; index < candidates.length; index += 1) {
        roll -= candidates[index].weight;

        if (roll < 0) {
          return candidates[index].type;
        }
      }

      return candidates[0].type;
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
          "현재 단계: 일반 봉쇄",
          `최고 도달 웨이브: ${progress.bestWave > 0 ? `${progress.bestWave} / ${RIFT_DEFENSE_WAVES.length}` : "기록 없음"}`,
          `최고 방어 등급: ${progress.bestGrade || "기록 없음"}`,
          "추천 편성: 전열 2, 힐러 1, 광역 또는 관통 화력 1"
        ]
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
        victoryCondition: floorType === "rest" || floorType === "supply" || floorType === "shop" || floorType === "relic"
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

    function getCurrentStageDefinition() {
      const saveData = getSaveData();
      const selectedStageId = saveData && saveData.stageId;

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

    return {
      getCurrentEndlessChainState,
      getAvailableRelicChoicesForEvent,
      buildRiftDefenseStageDefinition,
      buildEndlessStageDefinition,
      getCurrentStageDefinition,
      getStageDefinitionById
    };
  }

  global.BattleStageFactory = {
    createController
  };
})(window);
