// main.js
import { 
    points, pointMap, playerSettings, 
    unconditionalTeleports, conditionalTeleports, 
    centerEntryPoints, centerExitOptions, ALL_PLAYERS_DATA 
} from './gameData.js';

import { initRender, renderGame, updateUI, showCelebration } from './render.js';
import { makeBotMove } from './bot.js';

// Глобальный объект игры
const game = {
    turn: 0, 
    dice: [0, 0],
    diceUsed: [false, false],
    selectedDieIndex: null,
    phase: 'roll', 
    testMode: false,
    bonusPlayerId: null, 
    savedDieIndex: null, 
    players: [], 
    activeDestinations: [], 
    tempPlayerCount: 0,
    pendingMoveInfo: null,

    init: function() {
        initRender();
        window.game = this; 
        // УДАЛИЛИ СТРОКУ, КОТОРАЯ ЛОМАЛА ЦВЕТ ФОНА
    },

    // --- СТАРТОВОЕ МЕНЮ ---
    start: function(count) {
        this.tempPlayerCount = count;
        let configs = (count === 2) ? [ALL_PLAYERS_DATA[0], ALL_PLAYERS_DATA[2]] : ALL_PLAYERS_DATA.slice(0, count);
        
        const container = document.getElementById('bot-rows-container');
        container.innerHTML = ''; 
        configs.forEach(cfg => {
            const row = document.createElement('div');
            row.className = 'bot-setup-row';
            row.innerHTML = `
                <div class="player-color-indicator" style="background-color:${cfg.color};color:${cfg.color}"></div>
                <label class="switch">
                    <input type="checkbox" id="bot-toggle-${cfg.id}">
                    <span class="slider"></span>
                </label>`;
            container.appendChild(row);
        });
        document.getElementById('bot-setup-overlay').style.display = 'flex';
    },

    confirmStart: function() {
        document.body.classList.remove('menu-active');
        document.getElementById('start-menu').style.display = 'none';
        document.getElementById('bot-setup-overlay').style.display = 'none';

        let configs = (this.tempPlayerCount === 2) ? [ALL_PLAYERS_DATA[0], ALL_PLAYERS_DATA[2]] : ALL_PLAYERS_DATA.slice(0, this.tempPlayerCount);

        this.players = configs.map(cfg => {
            const checkbox = document.getElementById(`bot-toggle-${cfg.id}`);
            const pieces = [];
            for(let i=1; i<=5; i++) pieces.push({ pos: `Старт${cfg.id}_${i}`, dist: 0 });
            return { ...cfg, pieces: pieces, isFinished: false, isBot: checkbox ? checkbox.checked : false };
        });

        this.refreshView();
        
        // Ускорили старт бота (500мс вместо 1000)
        if (this.players[this.turn].isBot) setTimeout(() => this.botTurnRoutine(), 500);
    },
    // --- ЛОГИКА ---

    tryRoll: function() {
        // Разрешаем бросок только в фазе roll и если не бот
        if (this.phase === 'roll' && !this.players[this.turn].isBot) {
            
            // Визуальный эффект нажатия (подсветка панелей)
            const p1 = document.getElementById('panel-1');
            const p2 = document.getElementById('panel-2');
            if(p1) p1.style.backgroundColor = "rgba(255,255,255,0.05)";
            if(p2) p2.style.backgroundColor = "rgba(255,255,255,0.05)";
            
            setTimeout(() => {
                if(p1) p1.style.backgroundColor = "";
                if(p2) p2.style.backgroundColor = "";
            }, 150);

            this.rollDice();
        }
    },

    rollDice: function() {
        if (this.phase !== 'roll') return;
        
        // 1. Генерируем случайные числа (по умолчанию)
        this.dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];

        // 2. ВОССТАНОВЛЕННЫЙ ТЕСТОВЫЙ РЕЖИМ
        if (this.testMode) {
            // Если включен тест-мод (Shift+T), спрашиваем числа
            const input = prompt("ТЕСТ: Введите два числа через пробел (например: 6 6)", "6 6");
            if (input) {
                const parts = input.split(" ").map(Number);
                // Проверяем, что ввели два числа
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    // Ограничиваем от 1 до 6, чтобы не сломать логику
                    const d1 = Math.max(1, Math.min(6, parts[0])); 
                    const d2 = Math.max(1, Math.min(6, parts[1]));
                    this.dice = [d1, d2];
                }
            }
        }

        this.diceUsed = [false, false];
        this.selectedDieIndex = null;
        this.phase = 'move'; 

        // Автовыбор дубля
        //if (this.dice[0] === this.dice[1] && this.checkIfMovePossible(this.dice[0])) {
        //    this.selectedDieIndex = 0;
        //}

        this.refreshView(); 

        const player = this.players[this.turn];
        const rolledSix = (this.dice[0] === 6 || this.dice[1] === 6);
        const hasPiecesInStart = player.pieces.some(p => String(p.pos).includes("Старт"));
        const hasPiecesInPrison = player.pieces.some(p => String(p.pos).includes("Плен"));

        // Если бот
        if (player.isBot) {
            setTimeout(() => makeBotMove(this), 500);
        } else {
            // Если человек
        //if (rolledSix && (hasPiecesInStart || hasPiecesInPrison)) return; 
        
        // Проверяем, есть ли вообще возможные ходы
        const canMove1 = this.checkIfMovePossible(this.dice[0]);
        const canMove2 = this.checkIfMovePossible(this.dice[1]);

        if (!canMove1 && !canMove2) {
            // === ИСПРАВЛЕНИЕ: ДУБЛЬ 6 ДАЕТ ПРАВО ПЕРЕБРОСА ДАЖЕ ЕСЛИ НЕТ ХОДОВ ===
            if (this.dice[0] === 6 && this.dice[1] === 6) {
                // Это дубль 6! Ходов нет, но игрок должен кинуть еще раз.
                this.diceUsed = [false, false];
                
                // --- ДОБАВИТЬ ЭТУ СТРОКУ ---
                this.phase = 'roll'; 
                // ---------------------------

                this.refreshView();
                
                // Если это бот, нужно пнуть его, чтобы он кинул снова
                if (player.isBot) setTimeout(() => this.rollDice(), 800);
                
                return;
            }
            // ======================================================================

            // Обычная логика пропуска хода (не 6:6)
            this.diceUsed = [true, true];
            this.phase = 'wait';
            this.refreshView();
            setTimeout(() => this.nextTurn(), 1000);
        }
        }
    },

    selectDie: function(index) {
        // Запрещаем человеку кликать кубики во время хода бота
        if (this.players[this.turn].isBot) return;

        if (this.phase !== 'move' || this.diceUsed[index]) return;
        this.selectedDieIndex = (this.selectedDieIndex === index) ? null : index;
        this.refreshView();
    },

    getDiceSvg: function(val) {
        if (!val) return '';
        const dots = {
            1: [[50,50]], 2: [[25,25],[75,75]], 3: [[25,25],[50,50],[75,75]],
            4: [[25,25],[75,25],[25,75],[75,75]], 5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
            6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]
        }[val] || [];
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${dots.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="10" fill="currentColor"/>`).join('')}</svg>`;
    },

    // --- ПРОВЕРКИ И ДВИЖЕНИЕ ---
    getPieceAt: function(pos) {
        for (let pIdx = 0; pIdx < this.players.length; pIdx++) {
            const pl = this.players[pIdx];
            for (let pcIdx = 0; pcIdx < pl.pieces.length; pcIdx++) {
                if (pl.pieces[pcIdx].pos == pos) return { player: pl, index: pcIdx };
            }
        }
        return null;
    },

    findFreeStartSlot: function(playerId) {
        for (let i = 1; i <= 5; i++) {
            const slot = `Старт${playerId}_${i}`;
            if (!this.getPieceAt(slot)) return slot;
        }
        return null;
    },

    // main.js

    // main.js -> checkPath

    // main.js -> checkPath (ИСПРАВЛЕННАЯ)

    checkPath: function(startPos, steps, playerId, distOverride = null) {
        const player = this.players.find(p => p.id === playerId);
        const settings = playerSettings[playerId];
        let currentPos = startPos;
        const pieceObj = player.pieces.find(p => p.pos === startPos);
        
        // Берем виртуальную дистанцию, если она передана
        let currentDist = (distOverride !== null) 
                          ? distOverride 
                          : (pieceObj ? pieceObj.dist : 0);

        for (let s = 1; s <= steps; s++) {
            let nextPos = null;
            if (String(currentPos).includes("Финиш")) {
                const currStep = parseInt(currentPos.split('_')[1]);
                if (currStep + 1 > 5) return { valid: false, reason: "wall" };
                nextPos = `Финиш${playerId}_${currStep + 1}`;
            } else if (typeof currentPos === 'number') {
                // === ВЕРНУЛИ КАК БЫЛО: -1 (Правильное направление) ===
                if (currentPos == settings.gate && currentDist > 30) nextPos = `Финиш${playerId}_1`;
                else nextPos = (currentPos - 1 + 216) % 216; 
                // =====================================================
            } else return { valid: true, pos: null }; 

            if (s !== steps) {
                if (this.getPieceAt(nextPos)) return { valid: false, reason: "block" };
            }
            currentPos = nextPos;
            if (typeof currentPos === 'number') currentDist++; 
        }

        let finalPos = currentPos;
        if (typeof finalPos === 'number') {
            let hops = 0;
            while (unconditionalTeleports[finalPos] && hops < 5) {
                finalPos = unconditionalTeleports[finalPos];
                hops++;
            }
        }
        
        const obstacle = this.getPieceAt(finalPos);
        if (obstacle) {
            if (obstacle.player.id === playerId) {
                if (finalPos === startPos) return { valid: true, pos: finalPos };
                return { valid: false, reason: "busy_self" };
            }
            if (String(finalPos).includes("Финиш")) return { valid: false, reason: "busy_finish" };
        }
        return { valid: true, pos: finalPos };
    },

    isMoveValidForPiece: function(pieceIndex, playerId, steps) {
        const player = this.players.find(p => p.id === playerId);
        const piece = player.pieces[pieceIndex];
        const startPos = piece.pos;
        const settings = playerSettings[playerId];

        if (this.phase === 'bonus') {
            if (String(startPos).includes("Старт") || String(startPos).includes("Плен")) return false;
        }

        if (String(startPos).includes("Старт") || String(startPos).includes("Плен")) {
            if (steps !== 6) return false;
            if (String(startPos).includes("Плен")) return this.findFreeStartSlot(player.id) !== null;
            const exitPos = settings.startExit;
            const occupant = this.getPieceAt(exitPos);
            return !occupant || occupant.player.id !== playerId;
        }

        if (startPos === "Центр") return steps === 3;
        if (centerEntryPoints.includes(startPos) && steps === 3) return true;

        const result = this.checkPath(startPos, steps, playerId);
        return result.valid;
    },

    checkIfMovePossible: function(steps, playerIdOverride = null) {
        const player = playerIdOverride 
            ? this.players.find(p => p.id === playerIdOverride) 
            : this.players[this.turn];
        for (let i = 0; i < player.pieces.length; i++) {
            if (this.isMoveValidForPiece(i, player.id, steps)) return true;
        }
        return false;
    },

    // main.js

    // main.js -> calculateMoveOptions

    calculateMoveOptions: function(pieceIndex, steps, playerId, overridePos = null, overrideDist = null) {
        const player = this.players.find(p => p.id === playerId);
        const pieceObj = player.pieces[pieceIndex];
        
        // Гарантируем, что 0 не превратится в null
        let currentPos = (overridePos !== null) ? overridePos : pieceObj.pos;
        
        const options = [];

        if (this.phase === 'bonus') {
            if (String(currentPos).includes("Старт") || String(currentPos).includes("Плен")) return [];
        }

        if (currentPos === "Центр") {
            if (steps === 3) centerExitOptions.forEach(opt => options.push({ target: opt, dist: 0 }));
        }
        else if (centerEntryPoints.includes(currentPos) && steps === 3) {
            options.push({ target: "Центр", dist: 0 });
            const standardMove = this.checkPath(currentPos, steps, playerId, overrideDist);
            if (standardMove.valid) options.push({ target: standardMove.pos, dist: steps });
        }
        // === ПРОВЕРКА ТЕЛЕПОРТОВ ===
        else if (typeof currentPos === 'number' && conditionalTeleports[currentPos]) {
            // Проверяем кубик и телепорт
            if (conditionalTeleports[currentPos].dice === steps) {
                const rule = conditionalTeleports[currentPos];
                const distTeleport = (rule.target - currentPos + 216) % 216;
                const targetOccupant = this.getPieceAt(rule.target);
                
                // Разрешаем, если пусто ИЛИ если там враг
                if (!targetOccupant || targetOccupant.player.id !== playerId) {
                    options.push({ target: rule.target, dist: distTeleport });
                }
            }
            // Обычный ход добавляем всегда (если валиден)
            const standardMove = this.checkPath(currentPos, steps, playerId, overrideDist);
            if (standardMove.valid) options.push({ target: standardMove.pos, dist: steps });
        }
        // ============================
        else {
            if (String(currentPos).includes("Старт") || String(currentPos).includes("Плен")) {
                if (steps === 6) {
                    if (String(currentPos).includes("Плен")) options.push({ target: "ESCAPE_PRISON", dist: 0 });
                    else {
                        const settings = playerSettings[playerId];
                        const newPos = settings.startExit;
                        const occupant = this.getPieceAt(newPos);
                        if (!occupant || occupant.player.id !== playerId) options.push({ target: newPos, dist: 0 });
                    }
                }
            } else {
                const check = this.checkPath(currentPos, steps, playerId, overrideDist);
                if (check.valid) {
                    const distVal = (typeof check.pos === 'number' && typeof currentPos === 'number') ? steps : 0;
                    options.push({ target: check.pos, dist: distVal });
                }
            }
        }
        return options;
    },

    executeMove: function(pieceIndex, steps, isBonus) {
        const playerId = isBonus ? this.bonusPlayerId : this.players[this.turn].id;
        const options = this.calculateMoveOptions(pieceIndex, steps, playerId);
        this.activeDestinations = [];
        this.pendingMoveInfo = { pieceIndex, steps, isBonus, playerId, optionsMap: {} };

        if (options.length === 0) return;
        if (options[0].target === "ESCAPE_PRISON") {
            const player = this.players.find(p => p.id === playerId);
            this.processPrisonEscape(player, player.pieces[pieceIndex].pos);
            return;
        }

        if (options.length === 1) {
            this.finalizeMove(pieceIndex, options[0].target, isBonus, steps, options[0].dist);
        } else {
            options.forEach(opt => {
                this.activeDestinations.push(opt.target);
                this.pendingMoveInfo.optionsMap[opt.target] = opt.dist;
            });
            this.refreshView();
        }
    },

   // main.js

    handlePieceClick: function(pieceIndex, ownerId) {
        const player = this.players.find(p => p.id === ownerId);
        if (player.isBot) return; 

        // Если бонусный ход (выход из плена)
        if (this.phase === 'bonus') {
            if (ownerId !== this.bonusPlayerId) return;
            this.executeMove(pieceIndex, 6, true);
            return;
        }

        if (this.phase !== 'move') return;
        if (ownerId !== this.players[this.turn].id) return;

        // Если уже выбрана эта же фишка — отменяем выбор (чтобы можно было передумать)
        if (this.pendingMoveInfo && this.pendingMoveInfo.pieceIndex === pieceIndex) {
            this.activeDestinations = [];
            this.pendingMoveInfo = null;
            this.selectedDieIndex = null; // Сброс выбора кубика
            this.refreshView();
            return;
        }

        // Если пользователь ЯВНО выбрал кубик (нажал на плашку внизу), уважаем его выбор
        if (this.selectedDieIndex !== null) {
            this.executeMove(pieceIndex, this.dice[this.selectedDieIndex], false);
            return;
        }

        // --- ЛОГИКА АВТОМАТИЧЕСКОГО КОМБО ---
        console.log(`--- CLICKED PIECE ${pieceIndex} (Player ${ownerId}) ---`);
        const optionsMap = {}; 
        const activeDestinations = [];

        // Вспомогательная функция поиска ходов
        const getStepOptions = (dieIdx) => {
             return this.calculateMoveOptions(pieceIndex, this.dice[dieIdx], player.id);
        };

        // 1. Собираем обычные ходы (по одному кубику)
        [0, 1].forEach(dieIdx => {
            if (!this.diceUsed[dieIdx]) {
                const opts = getStepOptions(dieIdx);
                opts.forEach(opt => {
                    // Если такой цели еще нет, добавляем
                    if (!optionsMap[opt.target]) {
                        optionsMap[opt.target] = { 
                            // Важно: помечаем, что это простой ход
                            sequence: [{dieIdx: dieIdx, steps: this.dice[dieIdx], target: opt.target, dist: opt.dist}],
                            totalDist: opt.dist 
                        };
                        activeDestinations.push(opt.target);
                    }
                });
            }
        });

        // 2. Ищем КОМБО (если оба кубика свободны)
        if (!this.diceUsed[0] && !this.diceUsed[1]) {
            // Берем копию уже найденных первых шагов
            // (Важно: Object.keys вернет ID точек, куда можно ступить первым шагом)
            const firstStepTargets = Object.keys(optionsMap); 
            
            firstStepTargets.forEach(targetKey => {
                const firstMoveData = optionsMap[targetKey];
                // Берем первый вариант (обычно он один) попадания в эту точку
                const firstMove = firstMoveData.sequence[0]; 
                
                // Проверяем, можно ли пойти дальше
                const startPosForStep2 = firstMove.target; 
                
                // Нельзя продолжать ход, если зашли на финиш или вышли из тюрьмы
                if (String(startPosForStep2).includes("Финиш") || startPosForStep2 === "ESCAPE_PRISON") return;

                const currentPieceDist = player.pieces[pieceIndex].dist;
                const distAtIntermediatePoint = currentPieceDist + firstMove.dist;
                
                // Какой кубик остался?
                const remainingDieIdx = (firstMove.dieIdx === 0) ? 1 : 0;
                const step2Val = this.dice[remainingDieIdx];

                const secondStepOptions = this.calculateMoveOptions(
                    pieceIndex, 
                    step2Val, 
                    player.id, 
                    startPosForStep2,        
                    distAtIntermediatePoint  
                );
                
                secondStepOptions.forEach(opt => {
                     const finalTarget = opt.target;
                     // Добавляем комбо-вариант
                     // Если такая точка уже была (как одиночный ход), мы ее ПЕРЕЗАПИШЕМ комбо-ходом? 
                     // Нет, лучше оставить выбор игроку. Но обычно дальняя точка уникальна.
                     if (!optionsMap[finalTarget]) {
                        optionsMap[finalTarget] = {
                            sequence: [
                                firstMove,
                                { dieIdx: remainingDieIdx, steps: step2Val, target: finalTarget, dist: opt.dist }
                            ],
                            totalDist: firstMove.dist + opt.dist
                        };
                        activeDestinations.push(finalTarget);
                     }
                });
            });
        }

        // Если ходов нет вообще
        if (activeDestinations.length === 0) return;

        // === УЛУЧШЕНИЕ: ЕСЛИ ВСЕГО ОДИН ХОД — ДЕЛАЕМ ЕГО СРАЗУ ===
        // (Но только если это не опасный ход, чтобы игрок успел понять, что происходит.
        // Хотя для динамики лучше сразу).
        /* Если вы хотите "мгновенный ход", раскомментируйте блок ниже.
           Если хотите всегда видеть подсветку — оставьте закомментированным.
           
           Я рекомендую оставить подсветку, так как мгновенный прыжок может запутать, 
           куда именно полетела фишка. Но если вас бесит лишний клик — включайте.
        */
        if (activeDestinations.length === 1) {
             const target = activeDestinations[0];
             const moveData = optionsMap[target];
             
             // Запускаем ход (или цепочку ходов)
             this.executeSequence(pieceIndex, moveData.sequence, 0);
             
             // Очищаем состояние выбора
             this.activeDestinations = [];
             this.pendingMoveInfo = null;
             this.refreshView();
             return;
        }

        this.activeDestinations = activeDestinations;
        this.pendingMoveInfo = { 
            pieceIndex, 
            playerId: ownerId, 
            complexOptions: optionsMap 
        };
        this.refreshView();
    },

    // --- НОВАЯ ОБРАБОТКА КЛИКА ПО ТОЧКЕ ---
    handlePointClick: function(targetId) {
        if (!this.activeDestinations.includes(targetId)) return;
        if (!this.pendingMoveInfo) return;

        if (this.pendingMoveInfo.complexOptions) {
            // Запуск цепочки
            const moveData = this.pendingMoveInfo.complexOptions[targetId];
            if (moveData) {
                this.executeSequence(this.pendingMoveInfo.pieceIndex, moveData.sequence, 0);
            }
        } else {
            // Старый режим (для совместимости)
            const info = this.pendingMoveInfo;
            this.finalizeMove(info.pieceIndex, targetId, info.isBonus, info.steps, info.optionsMap[targetId]);
        }

        this.activeDestinations = [];
        this.pendingMoveInfo = null;
        this.refreshView();
    },

    // --- РЕКУРСИВНОЕ ВЫПОЛНЕНИЕ ЦЕПОЧКИ ХОДОВ ---
    executeSequence: function(pieceIndex, sequence, stepIdx) {
        // Определяем, последний ли это шаг
        const isLastStep = (stepIdx === sequence.length - 1);
        
        // Включаем флаг "Комбо идет", если это НЕ последний шаг.
        // Это запретит checkEndTurn сжигать кубики и завершать ход раньше времени.
        this.isComboActive = !isLastStep;

        const move = sequence[stepIdx];
        
        // Явно выбираем кубик, чтобы finalizeMove знала, какой сжечь
        this.selectedDieIndex = move.dieIdx;

        // Выполняем ход
        this.finalizeMove(pieceIndex, move.target, false, move.steps, move.dist);

        // Если есть следующий шаг
        if (!isLastStep) {
            setTimeout(() => {
                // Проверяем, жива ли еще фишка и не закончилась ли игра
                const player = this.players.find(p => p.pieces[pieceIndex]);
                if (player && !player.isFinished) {
                    this.executeSequence(pieceIndex, sequence, stepIdx + 1);
                } else {
                    // Если фишка исчезла (плен?), снимаем флаг
                    this.isComboActive = false;
                    this.checkEndTurn();
                }
            }, 400);
        }
    },

    processPrisonEscape: function(player, currentPos) {
        if(currentPos === "FORCE_CANCEL") {
             this.phase = 'move'; 
             this.bonusPlayerId = null;
             this.diceUsed[this.savedDieIndex] = true; 
             this.selectedDieIndex = null;
             this.checkEndTurn();
             this.refreshView();
             if (this.players[this.turn].isBot && this.phase === 'move') setTimeout(() => makeBotMove(this), 500);
             return;
        }

        const freeSlot = this.findFreeStartSlot(player.id);
        if (!freeSlot) return; 
        
        const piece = player.pieces.find(p => p.pos === currentPos);
        piece.pos = freeSlot; 
        piece.dist = 0;
        
        const wardenId = parseInt(currentPos.split("Плен")[1].split("_")[0]);
        const warden = this.players.find(p => p.id === wardenId);
        this.phase = 'bonus'; 
        
        if (this.checkIfMovePossible(6, wardenId)) {
            this.bonusPlayerId = wardenId;
            this.savedDieIndex = this.selectedDieIndex; 
            this.refreshView();
            if (warden.isBot) setTimeout(() => makeBotMove(this), 500);
        } else {
            this.phase = 'move'; 
            this.bonusPlayerId = null;
            this.diceUsed[this.selectedDieIndex] = true;
            this.selectedDieIndex = null;
            this.checkEndTurn();
            this.refreshView();
            if (this.players[this.turn].isBot && this.phase === 'move') setTimeout(() => makeBotMove(this), 500);
        }
    },

    capturePiece: function(victim, capturerId) {
        const victimPlayer = victim.player;
        let prisonSlot = null;
        for (let i = 1; i <= 7; i++) {
            const slotId = `Плен${capturerId}_${i}`;
            if (!this.getPieceAt(slotId)) { prisonSlot = slotId; break; }
        }
        if (prisonSlot) {
            victimPlayer.pieces[victim.index].pos = prisonSlot;
            victimPlayer.pieces[victim.index].dist = 0; 
            return true;
        }
        return false;
    },

   finalizeMove: function(pieceIndex, newPos, isBonus, steps, distIncrease) {
        const playerId = isBonus ? this.bonusPlayerId : this.players[this.turn].id;
        const player = this.players.find(p => p.id === playerId);
        const pieceObj = player.pieces[pieceIndex];

        if (newPos !== null) {
            // === ПРОВЕРКИ НА СЪЕДЕНИЕ / ТЕЛЕПОРТ ===
            let hops = 0;
            while (unconditionalTeleports[newPos] && hops < 5) {
                newPos = unconditionalTeleports[newPos];
                hops++;
            }
            const occupant = this.getPieceAt(newPos);
            if (occupant) {
                const isSelfLoop = (occupant.player.id === player.id && occupant.index === pieceIndex);
                if (!isSelfLoop) {
                    if (occupant.player.id === player.id) return; 
                    else { 
                        if (String(newPos).includes("Финиш")) return; 
                        if(!this.capturePiece(occupant, player.id)) return; 
                    }
                }
            }
            // ========================================

            pieceObj.pos = newPos;
            if (typeof distIncrease === 'number') pieceObj.dist += distIncrease;
            
            if (isBonus) {
                this.phase = 'move';
                this.diceUsed[this.savedDieIndex] = true; 
                this.selectedDieIndex = null;
                this.bonusPlayerId = null;
            } else {
                this.diceUsed[this.selectedDieIndex] = true;
                this.selectedDieIndex = null; 
            }
            
            /*const usedCount = (this.diceUsed[0] ? 1 : 0) + (this.diceUsed[1] ? 1 : 0);
            if (usedCount === 1) {
                const remainingIndex = this.diceUsed[0] ? 1 : 0;
                if (this.checkIfMovePossible(this.dice[remainingIndex])) {
                    this.selectedDieIndex = remainingIndex;
                }
            }*/

            // Проверка победы
            const allHome = player.pieces.every(p => String(p.pos).includes("Финиш"));
            let justWon = false;
            
            if (allHome && !player.isFinished) {
                player.isFinished = true;
                justWon = true; 
            }

            this.pendingMoveInfo = null; 
            this.activeDestinations = [];
            
            this.checkEndTurn();
            this.refreshView();
            
            // === ЗАПУСК САЛЮТА ===
            if (justWon) {
                // 1. Берем данные точки финиша (где она должна быть в процентах)
                const destPoint = pointMap[newPos]; 
                
                // 2. Берем реальный квадрат игрового поля на экране
                const field = document.getElementById('game-field');
                
                if (destPoint && field) {
                    const rect = field.getBoundingClientRect();
                    
                    // 3. Считаем абсолютные пиксели на экране
                    // Отступ слева + (Ширина * процент / 100)
                    const absoluteX = rect.left + (rect.width * destPoint.xPercent / 100);
                    const absoluteY = rect.top + (rect.height * destPoint.yPercent / 100);
                    
                    // 4. Запускаем салют с флагом isPixels = true
                    showCelebration(player.color, absoluteX, absoluteY, true);
                } else {
                    // Если вдруг что-то не нашлось - по центру
                    showCelebration(player.color, window.innerWidth/2, window.innerHeight/2, true);
                }
            }
            // =====================
            
            if (this.players[this.turn].isBot && this.phase === 'move') {
                 setTimeout(() => makeBotMove(this), 500); 
            }
        }
    },

    checkEndTurn: function() {
        if (this.isComboActive) return;
        const usedCount = (this.diceUsed[0] ? 1 : 0) + (this.diceUsed[1] ? 1 : 0);
        if (usedCount === 2) {
            if (this.dice[0] === 6 && this.dice[1] === 6) {
                this.diceUsed = [false, false];
                this.phase = 'roll';
                this.refreshView();
                if (this.players[this.turn].isBot) setTimeout(() => this.botTurnRoutine(), 500);
            } else {
                this.phase = 'wait';
                setTimeout(() => this.nextTurn(), 0);
            }
        } else {
            const remainingIdx = this.diceUsed[0] ? 1 : 0;
            if (!this.checkIfMovePossible(this.dice[remainingIdx])) {
                this.diceUsed[remainingIdx] = true;
                this.refreshView();
                this.phase = 'wait';
                setTimeout(() => this.nextTurn(), 0);
            }
        }
    },

    nextTurn: function() {
        const activePlayers = this.players.filter(p => !p.isFinished);
        if (activePlayers.length <= 1) {
            this.phase = 'finished'; 
            this.refreshView();
            return; 
        }
        let attempts = 0;
        do {
            this.turn++;
            if (this.turn >= this.players.length) this.turn = 0;
            attempts++;
        } while (this.players[this.turn].isFinished && attempts < 10);

        this.dice = [0, 0];
        this.diceUsed = [false, false];
        this.selectedDieIndex = null;
        this.phase = 'roll';
        this.bonusPlayerId = null;
        this.refreshView();
        this.botTurnRoutine();
    },

    botTurnRoutine: function() {
        const player = this.players[this.turn];
        if (!player.isBot || this.phase === 'finished') return;
        
        // Уменьшили задержки до 300мс и 500мс
        if (this.phase === 'roll') {
            setTimeout(() => {
                this.rollDice();
            }, 300); 
        } else if (this.phase === 'move') {
            setTimeout(() => makeBotMove(this), 500);
        }
    },

    refreshView: function() {
        // Добавляем логику блокировки кнопки, если ходит бот
        const isBotTurn = this.players[this.turn] && this.players[this.turn].isBot;
        
        updateUI(this, this.getDiceSvg);
        renderGame(this);
        
        // Принудительно отключаем кнопку, если бот
        const btn = document.getElementById('roll-btn');
        if (btn && isBotTurn) {
            btn.disabled = true;
            btn.style.borderColor = "rgba(255,255,255,0.2)";
        }
    },
    
    updateStyle: function(varName, value) {
        document.documentElement.style.setProperty(varName, value);
    },
    
    toggleTestMode: function() {
        this.testMode = !this.testMode;
        const badge = document.getElementById('test-badge');
        const panel = document.getElementById('debug-panel');
        if (badge) {
            badge.style.display = this.testMode ? 'block' : 'none';
            if (panel) panel.style.display = this.testMode ? 'block' : 'none';
        }
    }
};

// Запуск
game.init();

// Вешаем слушатели
/*document.getElementById('dice1').onclick = () => game.selectDie(0);
document.getElementById('dice2').onclick = () => game.selectDie(1);*/
// main.js (в самом низу файла)

document.addEventListener('keydown', function(event) {
    // 1. Тестовый режим (Shift + T)
    if (event.shiftKey && (event.code === 'KeyT' || event.key === 'T' || event.key === 'Е')) {
        game.toggleTestMode();
    }

    // 2. Бросок кубиков (Пробел)
    if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault(); // Чтобы страница не прыгала
        
        // Просто вызываем нашу новую функцию попытки броска
        // Она сама мигнет панелями и проверит, можно ли бросать
        game.tryRoll();
    }
});