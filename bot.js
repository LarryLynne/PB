// bot.js
import { unconditionalTeleports, conditionalTeleports, centerEntryPoints, playerSettings } from './gameData.js';

export function makeBotMove(game) {
    let activePlayerId;
    const isBonusTurn = (game.phase === 'bonus');
    activePlayerId = isBonusTurn ? game.bonusPlayerId : game.players[game.turn].id;
    const player = game.players.find(p => p.id === activePlayerId);
    
    if (!player || !player.isBot) return;

    // 1. Сбор ходов
    let allLegalMoves = [];
    let movesToAnalyze = [];

    if (isBonusTurn) {
        movesToAnalyze.push({ diceVal: 6, dieIdx: -1 }); 
    } else {
        if (game.selectedDieIndex !== null) {
            movesToAnalyze.push({ diceVal: game.dice[game.selectedDieIndex], dieIdx: game.selectedDieIndex });
        } else {
            if (!game.diceUsed[0]) movesToAnalyze.push({ diceVal: game.dice[0], dieIdx: 0 });
            if (!game.diceUsed[1]) movesToAnalyze.push({ diceVal: game.dice[1], dieIdx: 1 });
        }
    }

    movesToAnalyze.forEach(move => {
        player.pieces.forEach((piece, pIdx) => {
            const options = game.calculateMoveOptions(pIdx, move.diceVal, player.id);
            options.forEach(opt => {
                let score = evaluateSmartStrategy(opt.target, player, piece, game, move.diceVal, opt.dist);
                
                allLegalMoves.push({
                    dieIndex: move.dieIdx,
                    pieceIndex: pIdx,
                    target: opt.target,
                    dist: opt.dist,
                    isEscape: (opt.target === "ESCAPE_PRISON"),
                    steps: move.diceVal,
                    score: score
                });
            });
        });
    });

    // 2. Выбор
    if (allLegalMoves.length > 0) {
        // Сортируем по очкам. Небольшой рандом только для абсолютно равных ходов.
        allLegalMoves.sort((a, b) => (b.score - a.score) || (Math.random() - 0.5));
        const bestMove = allLegalMoves[0];

        if (!isBonusTurn) game.selectedDieIndex = bestMove.dieIndex;
        
        if (bestMove.isEscape) {
            game.processPrisonEscape(player, player.pieces[bestMove.pieceIndex].pos);
        } else {
            game.finalizeMove(bestMove.pieceIndex, bestMove.target, isBonusTurn, bestMove.steps, bestMove.dist);
        }
    } else {
        // Нет ходов
        if (isBonusTurn) {
             game.processPrisonEscape(player, "FORCE_CANCEL");
        } else {
            // Переброс при 6:6
            if (game.dice[0] === 6 && game.dice[1] === 6) {
                game.diceUsed = [false, false];
                game.phase = 'roll';
                game.refreshView();
                setTimeout(() => game.rollDice(), 800);
                return;
            }
            const dieToBurn = (game.selectedDieIndex !== null) ? game.selectedDieIndex : (game.diceUsed[0] ? 1 : 0);
            game.diceUsed[dieToBurn] = true;
            game.selectedDieIndex = null;
            game.checkEndTurn();
        }
    }
}

// ==================================================================
// НОВЫЙ МОЗГ: "ИНСТИНКТЫ ОПЫТНОГО ИГРОКА"
// ==================================================================
function evaluateSmartStrategy(targetPos, player, pieceObj, game, diceVal, distIncrease) {
    let score = 0;
    const currentPos = pieceObj.pos;
    const playerId = player.id;
    const activePieces = player.pieces.filter(p => typeof p.pos === 'number' || p.pos === "Центр").length;

    // --- 0. БАЗОВАЯ БЕЗОПАСНОСТЬ ---
    const amIInDanger = (typeof currentPos === 'number') ? isPositionDangerous(currentPos, playerId, game) : false;
    const willBeInDanger = (typeof targetPos === 'number' && !String(targetPos).includes("Финиш")) 
                           ? isPositionDangerous(targetPos, playerId, game) 
                           : false;

    // --- 1. АБСОЛЮТНЫЕ ПРИОРИТЕТЫ (ИНСТИНКТ УБИЙЦЫ) ---
    
    // А) УБИЙСТВО. Если можем съесть — едим.
    const victim = game.getPieceAt(targetPos);
    if (victim && victim.player.id !== playerId) {
        return 20000; // Максимально возможный балл. Убить важнее всего.
    }

    // Б) СПАСЕНИЕ ИЗ ПЛЕНА / ЗАХОД В ФИНИШ
    if (targetPos === "ESCAPE_PRISON") return 5000;
    if (String(targetPos).includes("Финиш")) {
        const level = parseInt(targetPos.split('_')[1]);
        return 10000 + (level * 500); // Заводим домой при первой возможности
    }

    // --- 2. ЖЕСТКАЯ ЛОГИКА ТЕЛЕПОРТОВ ---

    // А) УГЛОВОЙ ТЕЛЕПОРТ (на 1)
    // Углы: 0, 54, 108, 162. Если мы там и выпало 1 — это всегда супер-выгодно (срез 75% карты).
    const cornerTeleports = [0, 54, 108, 162];
    if (cornerTeleports.includes(currentPos) && diceVal === 1) {
        // Проверяем, не перелетим ли мы свой дом (это проверяет движок, но на всякий случай)
        // Если ход возможен (мы здесь) — значит надо брать!
        return 15000; 
    }

    // Б) ЦЕНТР (ВЫХОД)
    // У каждого игрока есть "Любимый выход" (ближайший к дому)
    if (currentPos === "Центр" && targetPos !== "Центр") {
        const bestExits = { 1: 27, 2: 81, 3: 135, 4: 189 }; // ID игрока -> ID точки
        const myBestExit = bestExits[playerId];

        if (targetPos === myBestExit) {
            return 12000; // ИДЕАЛЬНЫЙ ВЫХОД. Почти так же круто, как убийство.
        } else {
            // Если выход не идеальный...
            // Выходим только если другого выхода нет или нас там убьют?
            // Нет, лучше сидеть в центре и ждать 1/3, чем выйти на другой конец карты.
            return -5000; 
        }
    }

    // В) ВХОД В ЦЕНТР (на 3)
    // Зайти в центр всегда выгодно, так как оттуда можно прыгнуть домой.
    if (targetPos === "Центр") {
        return 8000;
    }

    // --- 3. ТАКТИКА "КЕМПЕР" (ЗАСАДА) ---
    // Если стоим на входе в телепорт/центр...
    if (isTeleportEntry(currentPos)) {
        // ...и этот ход НЕ активирует телепорт (просто идем пешком)
        if (distIncrease === diceVal) {
             // ...то уходим только если нас сейчас убьют. Иначе сидим.
             if (!amIInDanger) return -2000; 
        }
    }
    
    // Если идем К точке входа (занимаем позицию для прыжка)
    if (isTeleportEntry(targetPos)) {
        score += 3000;
    }

    // --- 4. РАЗВИТИЕ (ЕСЛИ НЕТ СПЕЦ-ХОДОВ) ---
    
    // Выход из дома (Старт)
    if (String(currentPos).includes("Старт") && !String(targetPos).includes("Старт")) {
        // Если на поле меньше 2 фишек — выводим обязательно.
        if (activePieces < 2) score += 4000;
        // Если уже толпа — лучше двигать тех, кто есть.
        else score += 500;
    }

    // --- 5. ШТРАФЫ И БОНУСЫ ЗА ДВИЖЕНИЕ ---

    // Опасность (не идем под бой)
    if (willBeInDanger) score -= 5000;

    // Спасение (убегаем из-под боя)
    if (amIInDanger) score += 2500;

    // Просто движение вперед (чем ближе к финишу, тем ценнее шаг)
    score += distIncrease;

    // Подтяжка хвостов: если фишка в начале пути, чуть помогаем ей
    // (чтобы не было такого, что одна убежала, а остальные на старте)
    const pSettings = playerSettings[playerId];
    if (pSettings && typeof currentPos === 'number') {
         const distFromStart = (currentPos - pSettings.startExit + 216) % 216;
         if (distFromStart < 50) score += 100;
    }

    return score;
}

// === УТИЛИТЫ ===
function isTeleportEntry(pos) {
    if (unconditionalTeleports[pos]) return true; 
    if (conditionalTeleports[pos]) return true;   
    if (centerEntryPoints.includes(pos)) return true; 
    return false;
}

function isPositionDangerous(targetPos, myPlayerId, game) {
    if (typeof targetPos !== 'number') return false; 
    for (let i = 1; i <= 8; i++) {
        let backPos = (targetPos - i + 216) % 216;
        const enemy = game.getPieceAt(backPos);
        if (enemy && enemy.player.id !== myPlayerId) {
            return true;
        }
    }
    return false;
}