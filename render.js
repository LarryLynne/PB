// render.js
import { points, pointMap, unconditionalTeleports } from './gameData.js';

const gameField = document.getElementById("game-field");
const svgNS = "http://www.w3.org/2000/svg";
let svgLines, svgArrows;

export function initRender() {
    const oldSvg = document.querySelector("svg");
    if (oldSvg) oldSvg.remove();

    svgLines = document.createElementNS(svgNS, "svg");
    svgLines.id = "svg-lines";
    svgLines.style.cssText = "position:absolute;width:100%;height:100%;pointer-events:none;z-index:1;";
    gameField.appendChild(svgLines);

    svgArrows = document.createElementNS(svgNS, "svg");
    svgArrows.id = "svg-arrows";
    svgArrows.style.cssText = "position:absolute;width:100%;height:100%;pointer-events:none;z-index:4;";
    gameField.appendChild(svgArrows);
    
    // Добавляем маркер стрелки (neon)
    const defs = document.createElementNS(svgNS, "defs");
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", "arrow-neon");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("refX", "5");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    const poly = document.createElementNS(svgNS, "path");
    poly.setAttribute("d", "M0,0 L6,3 L0,6 L1.5,3 Z");
    poly.style.fill = "var(--arrow-color)";
    marker.appendChild(poly);
    defs.appendChild(marker);
    svgArrows.appendChild(defs);

    window.addEventListener("resize", updateGameFieldSize);
    setTimeout(updateGameFieldSize, 0);
}

export function renderGame(game) {
    // 1. Очистка (Линии и стрелки)
    while (svgLines.lastChild) svgLines.removeChild(svgLines.lastChild);
    const arrows = svgArrows.querySelectorAll('path');
    arrows.forEach(arrow => arrow.remove());
    
    // Очистка точек
    gameField.querySelectorAll(".point").forEach(el => el.remove());

    // 2. Отрисовка Линий
    points.forEach(point => {
        if (typeof point.id === 'number') {
            let nextId = point.id + 1;
            if (nextId === 216) nextId = 0;
            if (pointMap[nextId]) drawLine(point, pointMap[nextId], "var(--line-color)");
        }
        if (typeof point.id === 'string') {
            const parts = point.id.split('_'); 
            if (parts.length === 2) {
                const type = parts[0]; 
                const num = parseInt(parts[1]);
                const nextId = `${type}_${num + 1}`;
                if (pointMap[nextId]) {
                    let col = "var(--line-color)";
                    if (type.includes("Финиш")) col = "#FFD700";
                    if (type.includes("Старт")) col = "#4CAF50";
                    if (type.includes("Плен")) col = "#F44336"; 
                    drawLine(point, pointMap[nextId], col);
                }
            }
        }
    });

    // 3. Отрисовка Стрелок
    for (let fromId in unconditionalTeleports) {
        const toId = unconditionalTeleports[fromId];
        if (pointMap[fromId] && pointMap[toId]) drawCurvedArrow(pointMap[fromId], pointMap[toId]);
    }

    // 4. Отрисовка Точек (с цветными ореолами)
    // Определяем цвет активного игрока для подсветки
    let activeHighlightColor = "#ffffff"; // Белый по умолчанию
    if (game.phase === 'bonus' && game.bonusPlayerId) {
        const p = game.players.find(x => x.id === game.bonusPlayerId);
        if (p) activeHighlightColor = p.color;
    } else if (game.players[game.turn]) {
        activeHighlightColor = game.players[game.turn].color;
    }

    // 4. Отрисовка Точек
    points.forEach(point => {
        const div = document.createElement("div");
        div.className = "point";
        div.style.left = `${point.xPercent}%`;
        div.style.top = `${point.yPercent}%`;
        
        // Подсветка целей
        if (game.activeDestinations.includes(point.id)) {
            div.classList.add("highlight-dest");
            // ПЕРЕДАЕМ ЦВЕТ ИГРОКА В CSS-ПЕРЕМЕННУЮ
            div.style.setProperty('--dest-color', activeHighlightColor);
            
            div.onclick = (e) => {
                e.stopPropagation();
                game.handlePointClick(point.id);
            };
        }
        
        // ЦВЕТНЫЕ ОРЕОЛЫ (Желтые/Красные на поле) — оставляем как есть, но понижаем z-index, если это цель
        if (typeof point.id === 'number') {
            if (point.id % 6 === 0) {
                // ИСПОЛЬЗУЕМ ПЕРЕМЕННУЮ --spec-6
                div.style.boxShadow = "0 0 0 4px var(--spec-6)";
                
                if(!div.classList.contains("highlight-dest")) div.style.zIndex = "3";
            } else if (point.id % 3 === 0) {
                // ИСПОЛЬЗУЕМ ПЕРЕМЕННУЮ --spec-3
                div.style.boxShadow = "0 0 0 4px var(--spec-3)";
                
                if(!div.classList.contains("highlight-dest")) div.style.zIndex = "3";
            }
        }

        // Стандартная раскраска (Старт/Финиш/Плен...)
        const pid = String(point.id);
        if (pid.includes("Старт")) div.style.backgroundColor = "#4CAF50";
        else if (pid.includes("Финиш")) div.style.backgroundColor = "#FFD700";
        else if (pid.includes("Плен")) div.style.backgroundColor = "#F44336";
        else if (pid.includes("Центр")) div.style.backgroundColor = "white";
        else if ([0, 54, 108, 162].includes(point.id)) div.style.backgroundColor = "#fff";
        else div.style.backgroundColor = "var(--dot-color)";
        
        gameField.appendChild(div);
    });

    // 5. ОТРИСОВКА ФИШЕК (ИСПРАВЛЕННАЯ ЛОГИКА BLINK)
    game.players.forEach(player => {
        player.pieces.forEach((pieceObj, index) => {
            const loc = pointMap[pieceObj.pos];
            if (loc) {
                const pieceId = `p-${player.id}-${index}`;
                let pieceDiv = document.getElementById(pieceId);

                if (!pieceDiv) {
                    pieceDiv = document.createElement("div");
                    pieceDiv.id = pieceId;
                    pieceDiv.className = "piece";
                    pieceDiv.style.setProperty('--p-color', player.color);
                    pieceDiv.onclick = (e) => {
                        e.stopPropagation();
                        game.handlePieceClick(index, player.id);
                    };
                    gameField.appendChild(pieceDiv);
                }
                pieceDiv.style.left = `${loc.xPercent}%`;
                pieceDiv.style.top = `${loc.yPercent}%`;
                
                // === ВОТ ЗДЕСЬ БЫЛА ОШИБКА, ТЕПЕРЬ ИСПРАВЛЕНО ===
                if (game.phase === 'bonus' && player.id === game.bonusPlayerId) {
                    // Теперь проверяем: а может ли эта фишка походить на 6?
                    // Функция isMoveValidForPiece доступна через объект game
                    if (game.isMoveValidForPiece(index, player.id, 6)) {
                        pieceDiv.classList.add("blink");
                    } else {
                        pieceDiv.classList.remove("blink");
                    }
                } else {
                    pieceDiv.classList.remove("blink");
                }
                // ==================================================
            }
        });
    });
}

export function updateUI(game, getDiceSvg) {
    const d1El = document.getElementById('dice1');
    const d2El = document.getElementById('dice2');
    const btn = document.getElementById('roll-btn');

    d1El.innerHTML = game.dice[0] ? getDiceSvg(game.dice[0]) : '-';
    d2El.innerHTML = game.dice[1] ? getDiceSvg(game.dice[1]) : '-';
    
    d1El.style.borderColor = (game.selectedDieIndex === 0) ? "#fff" : "rgba(255,255,255,0.3)";
    d2El.style.borderColor = (game.selectedDieIndex === 1) ? "#fff" : "rgba(255,255,255,0.3)";
    
    d1El.style.opacity = game.diceUsed[0] ? "0.2" : "1";
    d2El.style.opacity = game.diceUsed[1] ? "0.2" : "1";

    btn.disabled = (game.phase !== 'roll');
    
    let activeColor = "#fff";
    if (game.phase === 'bonus') {
        const warden = game.players.find(p => p.id === game.bonusPlayerId);
        if(warden) activeColor = warden.color;
    } else {
        const player = game.players[game.turn];
        if (player) activeColor = player.color;
    }
    d1El.style.color = activeColor;
    d2El.style.color = activeColor;
    btn.style.color = activeColor;
    btn.style.borderColor = !btn.disabled ? activeColor : "rgba(255,255,255,0.2)";
}

function drawLine(p1, p2, color, width = 2) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", `${p1.xPercent}%`);
    line.setAttribute("y1", `${p1.yPercent}%`);
    line.setAttribute("x2", `${p2.xPercent}%`);
    line.setAttribute("y2", `${p2.yPercent}%`);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", width);
    svgLines.appendChild(line);
}

function drawCurvedArrow(p1, p2) {
    const w = gameField.clientWidth;
    const h = gameField.clientHeight;
    const x1 = (p1.xPercent / 100) * w;
    const y1 = (p1.yPercent / 100) * h;
    const x2 = (p2.xPercent / 100) * w;
    const y2 = (p2.yPercent / 100) * h;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const k = -0.25; 
    const cx = mx + (w/2 - mx) * k;
    const cy = my + (h/2 - my) * k;

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
    path.classList.add("teleport-arrow"); 
    path.setAttribute("marker-end", "url(#arrow-neon)");
    svgArrows.appendChild(path);
}

function updateGameFieldSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let size;
    const isMobilePortrait = w <= 768 && h > w;
    const isMobileLandscape = h <= 600 && w > h;

    if (isMobilePortrait) {
        size = Math.min(w * 0.95, h * 0.70);
        gameField.style.marginTop = "-10%"; 
    } else if (isMobileLandscape) {
        size = Math.min(w * 0.80, h * 0.95);
        gameField.style.marginTop = "0";
        gameField.style.marginLeft = "-10%"; 
    } else {
        size = Math.min(w, h) * 0.95;
        gameField.style.marginTop = "0";
        gameField.style.marginLeft = "0";
    }
    gameField.style.width = `${size}px`;
    gameField.style.height = `${size}px`;
}

// render.js

export function showCelebration(color, xVal, yVal, isPixels = false) {
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    
    // 1. Размер холста
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // 2. Логика координат
    let originX, originY;

    if (isPixels) {
        // Если Main.js уже посчитал пиксели (наш случай) — берем их как есть
        originX = xVal;
        originY = yVal;
        console.log(`Салют (Pixels): ${Math.round(originX)}:${Math.round(originY)}`);
    } else {
        // Если пришли проценты (запасной вариант)
        const field = document.getElementById('game-field');
        const rect = field.getBoundingClientRect();
        const pX = (xVal !== undefined) ? xVal : 50;
        const pY = (yVal !== undefined) ? yVal : 50;
        
        originX = rect.left + (rect.width * (pX / 100));
        originY = rect.top + (rect.height * (pY / 100));
        console.log(`Салют (Percent): ${Math.round(originX)}:${Math.round(originY)}`);
    }

    // 3. Массивы (ОБЯЗАТЕЛЬНО НУЖНЫ)
    const particles = [];
    const rockets = [];

    let spawning = true;
    setTimeout(() => { spawning = false; }, 3000);

    // --- КЛАССЫ ---
    class Particle {
        constructor(x, y, color) {
            this.x = x; this.y = y; this.color = color;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1; 
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.alpha = 1; 
            this.decay = Math.random() * 0.015 + 0.01;
        }
        update() {
            this.vx *= 0.95; this.vy *= 0.95; 
            this.x += this.vx; this.y += this.vy; 
            this.alpha -= this.decay;
        }
        draw() {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    class Rocket {
        constructor() {
            this.x = originX; 
            this.y = originY;
            const angle = Math.random() * Math.PI * 2;
            this.speed = Math.random() * 4 + 3; 
            this.vx = Math.cos(angle) * this.speed;
            this.vy = Math.sin(angle) * this.speed;
            this.color = color;
            this.life = 0;
            this.maxLife = Math.random() * 20 + 10; 
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            this.life++;
            if (this.life >= this.maxLife) { this.explode(); return false; }
            return true; 
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); 
            ctx.fill();
        }
        explode() {
            for (let i = 0; i < 40; i++) particles.push(new Particle(this.x, this.y, this.color));
        }
    }

    // --- ЦИКЛ АНИМАЦИИ ---
    function loop() {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        
        if (spawning && Math.random() < 0.2) rockets.push(new Rocket());
        
        for (let i = rockets.length - 1; i >= 0; i--) {
            if (!rockets[i].update()) rockets.splice(i, 1);
            else rockets[i].draw();
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].alpha <= 0) particles.splice(i, 1);
        }
        
        if (!spawning && rockets.length === 0 && particles.length === 0) {
            canvas.style.display = 'none'; 
            ctx.clearRect(0, 0, w, h); 
        } else {
            requestAnimationFrame(loop);
        }
    }
    loop();
}