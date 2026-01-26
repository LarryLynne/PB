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
        if (this.dice[0] === this.dice[1] && this.checkIfMovePossible(this.dice[0])) {
            this.selectedDieIndex = 0;
        }

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
        if (rolledSix && (hasPiecesInStart || hasPiecesInPrison)) return; 
        
        // Проверяем, есть ли вообще возможные ходы
        const canMove1 = this.checkIfMovePossible(this.dice[0]);
        const canMove2 = this.checkIfMovePossible(this.dice[1]);

        if (!canMove1 && !canMove2) {
            // === ИСПРАВЛЕНИЕ: ДУБЛЬ 6 ДАЕТ ПРАВО ПЕРЕБРОСА ДАЖЕ ЕСЛИ НЕТ ХОДОВ ===
            if (this.dice[0] === 6 && this.dice[1] === 6) {
                // Это дубль 6! Ходов нет, но игрок должен кинуть еще раз.
                // Мы НЕ помечаем кубики как использованные.
                // Мы просто оставляем фазу 'roll' и обновляем UI.
                
                // Можно добавить сообщение для понятности (опционально)
                const statusEl = document.getElementById('status-msg');
                if (statusEl) statusEl.innerText = "6:6! Нет ходов, но бросай еще!";

                // Сбрасываем выбор (на всякий случай) и выходим, давая нажать Throw снова
                this.diceUsed = [false, false];
                this.refreshView();
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

    checkPath: function(startPos, steps, playerId) {
        const player = this.players.find(p => p.id === playerId);
        const settings = playerSettings[playerId];
        let currentPos = startPos;
        const pieceObj = player.pieces.find(p => p.pos === startPos);
        let currentDist = pieceObj ? pieceObj.dist : 0;

        for (let s = 1; s <= steps; s++) {
            let nextPos = null;
            if (String(currentPos).includes("Финиш")) {
                const currStep = parseInt(currentPos.split('_')[1]);
                if (currStep + 1 > 5) return { valid: false, reason: "wall" };
                nextPos = `Финиш${playerId}_${currStep + 1}`;
            } else if (typeof currentPos === 'number') {
                if (currentPos == settings.gate && currentDist > 30) nextPos = `Финиш${playerId}_1`;
                else nextPos = (currentPos - 1 + 216) % 216;
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

    calculateMoveOptions: function(pieceIndex, steps, playerId) {
        const player = this.players.find(p => p.id === playerId);
        const pieceObj = player.pieces[pieceIndex];
        const currentPos = pieceObj.pos;
        const options = [];

        if (this.phase === 'bonus') {
            if (String(currentPos).includes("Старт") || String(currentPos).includes("Плен")) return [];
        }

        if (currentPos === "Центр") {
            if (steps === 3) centerExitOptions.forEach(opt => options.push({ target: opt, dist: 0 }));
        }
        else if (centerEntryPoints.includes(currentPos) && steps === 3) {
            options.push({ target: "Центр", dist: 0 });
            const standardMove = this.checkPath(currentPos, steps, playerId);
            if (standardMove.valid) options.push({ target: standardMove.pos, dist: steps });
        }
        else if (typeof currentPos === 'number' && conditionalTeleports[currentPos] && conditionalTeleports[currentPos].dice === steps) {
            const rule = conditionalTeleports[currentPos];
            const distTeleport = (rule.target - currentPos + 216) % 216;
            const targetOccupant = this.getPieceAt(rule.target);
            if (!targetOccupant || targetOccupant.player.id !== playerId) {
                options.push({ target: rule.target, dist: distTeleport });
            }
            const standardMove = this.checkPath(currentPos, steps, playerId);
            if (standardMove.valid) options.push({ target: standardMove.pos, dist: steps });
        }
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
                const check = this.checkPath(currentPos, steps, playerId);
                if (check.valid) options.push({ target: check.pos, dist: (typeof check.pos === 'number' && typeof currentPos === 'number') ? steps : 0 });
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

    handlePieceClick: function(pieceIndex, ownerId) {
        // Если ходит бот, игнорируем клики человека по его фишкам
        if (this.players.find(p => p.id === ownerId).isBot) return;

        const targetPlayer = this.players.find(p => p.id === ownerId);
        const targetPiece = targetPlayer.pieces[pieceIndex];

        if (this.activeDestinations.includes(targetPiece.pos)) {
            this.handlePointClick(targetPiece.pos);
            return;
        }
        if (this.phase === 'bonus') {
            if (ownerId !== this.bonusPlayerId) return;
            this.executeMove(pieceIndex, 6, true);
            return;
        }
        if (this.phase !== 'move') return;
        if (ownerId !== this.players[this.turn].id) return; 
        if (this.selectedDieIndex === null) return; 

        this.executeMove(pieceIndex, this.dice[this.selectedDieIndex], false);
    },

    handlePointClick: function(targetId) {
        if (!this.activeDestinations.includes(targetId)) return;
        const info = this.pendingMoveInfo;
        const distIncrease = info.optionsMap[targetId];
        this.finalizeMove(info.pieceIndex, targetId, info.isBonus, info.steps, distIncrease);
        this.activeDestinations = [];
        this.pendingMoveInfo = null;
        this.refreshView();
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
            
            const usedCount = (this.diceUsed[0] ? 1 : 0) + (this.diceUsed[1] ? 1 : 0);
            if (usedCount === 1) {
                const remainingIndex = this.diceUsed[0] ? 1 : 0;
                if (this.checkIfMovePossible(this.dice[remainingIndex])) {
                    this.selectedDieIndex = remainingIndex;
                }
            }

            // Проверка победы
            const allHome = player.pieces.every(p => String(p.pos).includes("Финиш"));
            let justWon = false;
            
            if (allHome && !player.isFinished) {
                player.isFinished = true;
                justWon = true; 
            }
            
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
document.getElementById('dice1').onclick = () => game.selectDie(0);
document.getElementById('dice2').onclick = () => game.selectDie(1);
document.addEventListener('keydown', function(event) {
    if (event.shiftKey && (event.code === 'KeyT' || event.key === 'T' || event.key === 'Е')) {
        game.toggleTestMode();
    }
});