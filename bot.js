// bot.js
import { unconditionalTeleports, conditionalTeleports, centerEntryPoints, playerSettings } from './gameData.js';

export function makeBotMove(game) {
    let activePlayerId;
    const isBonusTurn = (game.phase === 'bonus');

    if (isBonusTurn) {
        activePlayerId = game.bonusPlayerId;
    } else {
        activePlayerId = game.players[game.turn].id;
    }

    const player = game.players.find(p => p.id === activePlayerId);
    if (!player || !player.isBot) return;

    // 1. СБОР ХОДОВ
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
                let score = evaluateMoveScore(opt.target, player.id, opt.dist, piece.pos, game, move.diceVal);

                // КОМБО (Убийство следующим ходом)
                if (!isBonusTurn && game.selectedDieIndex === null) {
                    const otherDieIdx = (move.dieIdx === 0) ? 1 : 0;
                    if (!game.diceUsed[otherDieIdx]) {
                        const otherDieVal = game.dice[otherDieIdx];
                        if (typeof opt.target !== 'string') {
                            const comboCheck = game.checkPath(opt.target, otherDieVal, player.id);
                            if (comboCheck.valid) {
                                const potentialVictim = game.getPieceAt(comboCheck.pos);
                                if (potentialVictim && potentialVictim.player.id !== player.id) {
                                    score += 2500; // ОЧЕНЬ ВАЖНО
                                }
                            }
                        }
                    }
                }

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

    // 2. ВЫБОР
    if (allLegalMoves.length > 0) {
        // ... (логика выполнения хода, оставляем как было) ...
        allLegalMoves.sort((a, b) => (b.score - a.score) || (Math.random() - 0.5));
        const bestMove = allLegalMoves[0];

        if (!isBonusTurn) {
            game.selectedDieIndex = bestMove.dieIndex;
        }
        
        if (bestMove.isEscape) {
            game.processPrisonEscape(player, player.pieces[bestMove.pieceIndex].pos);
        } else {
            game.finalizeMove(bestMove.pieceIndex, bestMove.target, isBonusTurn, bestMove.steps, bestMove.dist);
        }
    } else {
        // ХОДОВ НЕТ
        if (isBonusTurn) {
             game.processPrisonEscape(player, "FORCE_CANCEL");
        } else {
            // === ДОБАВЛЕНО: Бот тоже должен понимать бонус 6:6 ===
            if (game.dice[0] === 6 && game.dice[1] === 6) {
                // Бот видит 6:6, но ходить не может.
                // Он должен просто перебросить.
                game.diceUsed = [false, false];
                game.phase = 'roll';
                game.refreshView();
                // Заставляем бота бросить снова через паузу
                setTimeout(() => game.rollDice(), 1000);
                return;
            }
            // ====================================================

            const dieToBurn = (game.selectedDieIndex !== null) 
                ? game.selectedDieIndex 
                : (game.diceUsed[0] ? 1 : 0);
            game.diceUsed[dieToBurn] = true;
            game.selectedDieIndex = null;
            game.checkEndTurn();
        }
    }
}



// bot.js

// bot.js

function evaluateMoveScore(targetPos, playerId, distIncrease, currentPos, game, diceVal) {
    let score = 0;

    // --- 0. БАЗОВЫЕ ДАННЫЕ ---
    let amIInDangerNow = false;
    let distToGateCurrent = 999;
    const pSettings = playerSettings[playerId];

    if (typeof currentPos === 'number') {
        amIInDangerNow = isPositionDangerous(currentPos, playerId, game);
        if (pSettings) {
            distToGateCurrent = (pSettings.gate - currentPos + 216) % 216;
        }
    }
    
    // Если мы в опасности — бежать!
    if (amIInDangerNow && distIncrease > 0) {
        score += 500;
    }

    // --- 1. УБИЙСТВО (ГЛАВНЫЙ ПРИОРИТЕТ) ---
    // Если можем кого-то съесть — едим не раздумывая.
    const victim = game.getPieceAt(targetPos);
    if (victim && victim.player.id !== playerId) {
        return 5000; // Максимальный приоритет
    }

    // --- 2. СПАСЕНИЕ ИЗ ПЛЕНА ---
    if (targetPos === "ESCAPE_PRISON") return 2000; 

    // --- 3. ВЫХОД ИЗ ЦЕНТРА (FIX) ---
    // Это теперь САМАЯ важная логика для навигации
    if (currentPos === "Центр" && targetPos !== "Центр") {
        // Базовый бонус за то, что мы вообще выходим
        score += 1000; 

        if (typeof targetPos === 'number' && pSettings) {
            // Считаем расстояние от точки выхода до ворот
            const distToHome = (pSettings.gate - targetPos + 216) % 216;
            
            // ЧЕМ БЛИЖЕ К ДОМУ, ТЕМ БОЛЬШЕ ОЧКОВ
            // Умножаем на 50, чтобы разница между выходами была очевидна боту
            // (216 - 10 шагов) * 50 = 10300 очков
            // (216 - 200 шагов) * 50 = 800 очков
            score += (216 - distToHome) * 50;
        }
        return score; // Прерываем тут, чтобы другие штрафы не сбили логику
    }

    // --- 4. НЕ ИДТИ ПОД СМЕРТЬ ---
    // (Если только это не финиш)
    if (typeof targetPos === 'number' && !String(targetPos).includes("Финиш")) {
        if (isPositionDangerous(targetPos, playerId, game)) {
            score -= 5000; 
        }
    }

    // --- 5. ФИНИШ ---
    if (String(targetPos).includes("Финиш")) {
        score += 3000;
        const level = parseInt(targetPos.split('_')[1]);
        score += level * 200; 
    }

    // --- 6. ВЫХОД ИЗ ДОМА (СТАРТ) ---
    if (String(currentPos).includes("Старт") && !String(targetPos).includes("Старт")) {
         score += 800; 
    }

    // --- 7. ТЕЛЕПОРТЫ И ВХОД В ЦЕНТР ---
    const isCenterEntry = (targetPos === "Центр");
    const isTeleport = (distIncrease > diceVal); 

    if (isCenterEntry) {
        // Вход в центр полезен, но не должен перекрывать выход
        // Ставим 500 (меньше, чем выход к дому)
        score += 500; 
    } 
    else if (isTeleport && typeof targetPos === 'number') {
        // Логика "Ловушка или Срезка"
        // Если прошли больше 200 клеток — значит нас откинуло назад
        if (distIncrease > 200) {
            // ЭТО ПРЫЖОК НАЗАД
            
            // Если мы уже на финишной прямой (ближе 50 клеток) — НЕЛЬЗЯ назад
            if (distToGateCurrent < 50) {
                score -= 10000; 
            } 
            else if (!amIInDangerNow) {
                score -= 2000; // Просто так назад не прыгаем
            } else {
                score += 500; // Спасаемся бегством
            }
        } else {
            // ЭТО ПРЫЖОК ВПЕРЕД (Срезка)
            score += 1500; 
        }
    }

    // --- 8. КЕМПИНГ ---
    // Если стоим на входе в телепорт/центр, лучше не стоять, а прыгать или уходить
    if (isTeleportEntry(currentPos) && !isTeleport && !isCenterEntry && !amIInDangerNow) {
        score -= 400; 
    }
    // Если идем НА вход в телепорт — это хорошо (план на след. ход)
    if (isTeleportEntry(targetPos) && targetPos !== currentPos) {
        score += 400; 
    }

    // --- 9. НЕ ТОЛПИТЬСЯ ---
    if (typeof targetPos === 'number') {
        if (isCrowdedWithFriends(targetPos, playerId, game)) {
            score -= 100; 
        }
    }

    // Базовый бонус за шаги
    score += distIncrease;

    return score;
}
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function isTeleportEntry(pos) {
    if (unconditionalTeleports[pos]) return true; 
    if (conditionalTeleports[pos]) return true;   
    if (centerEntryPoints.includes(pos)) return true; 
    return false;
}

function isCrowdedWithFriends(targetPos, myPlayerId, game) {
    for (let i = 1; i <= 2; i++) {
        let checkBack = (targetPos - i + 216) % 216;
        let checkFwd = (targetPos + i) % 216;
        let pBack = game.getPieceAt(checkBack);
        let pFwd = game.getPieceAt(checkFwd);
        if (pBack && pBack.player.id === myPlayerId) return true;
        if (pFwd && pFwd.player.id === myPlayerId) return true;
    }
    return false;
}

function isPositionDangerous(targetPos, myPlayerId, game) {
    if (typeof targetPos !== 'number') return false; 
    
    // Проверяем 6-8 клеток сзади (увеличил радиус паранойи)
    for (let i = 1; i <= 8; i++) {
        let backPos = (targetPos - i + 216) % 216;
        
        // Нюанс: если сзади стрелка, враг может быть даже дальше
        // Но пока хватит и простой проверки
        
        const enemy = game.getPieceAt(backPos);
        if (enemy && enemy.player.id !== myPlayerId) {
            return true;
        }
    }
    return false;
}