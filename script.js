document.addEventListener('DOMContentLoaded', () => {
    const STAGES = [
        { N: 7, T: 1, Delta: 100 }, { N: 8, T: 1, Delta: 90 }, { N: 9, T: 1, Delta: 80 },
        { N: 7, T: 2, Delta: 70 }, { N: 8, T: 2, Delta: 60 }, { N: 9, T: 2, Delta: 50 },
        { N: 7, T: 3, Delta: 40 }, { N: 8, T: 3, Delta: 25 }, { N: 9, T: 3, Delta: 10 }
    ];
    const STAGE_TIME_LIMIT = 10; // seconds

    const gridContainer = document.getElementById('grid-container');
    const stageInfo = document.querySelector('#stage-info span');
    const targetInfo = document.getElementById('target-info');
    const scoreInfo = document.querySelector('#score-info span');
    const timerBar = document.getElementById('timer-bar');

    const startScreen = document.getElementById('start-screen');
    const resultScreen = document.getElementById('result-screen');
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');

    let currentStage = 0;
    let score = 0;
    let targetsToFind = 0;
    let timerInterval;
    let timeLeft = STAGE_TIME_LIMIT;

    function hslToRgb(h, s, l) {
        s /= 100;
        l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s,
            x = c * (1 - Math.abs((h / 60) % 2 - 1)),
            m = l - c / 2,
            r = 0, g = 0, b = 0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function generateColors(delta) {
        const baseH = Math.random() * 360;
        const baseS = 40 + Math.random() * 60; // 40% - 100%
        const baseL = 40 + Math.random() * 20; // 40% - 60%

        const direction = Math.random() < 0.5 ? 1 : -1;
        let targetH = (baseH + direction * (delta / 2)) % 360; // Delta를 Hue 변화에 적용
        if (targetH < 0) targetH += 360;

        return {
            base: hslToRgb(baseH, baseS, baseL),
            target: hslToRgb(targetH, baseS, baseL)
        };
    }

    function updateTargetInfo() {
        targetInfo.innerHTML = 'Targets: ' + '● '.repeat(targetsToFind) + '○ '.repeat(STAGES[currentStage].T - targetsToFind);
    }

    function startTimer() {
        timeLeft = STAGE_TIME_LIMIT;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft -= 0.1;
            timerBar.style.width = `${(timeLeft / STAGE_TIME_LIMIT) * 100}%`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                gameOver('Time Over!');
            }
        }, 100);
    }

    function handleTileClick(e) {
        const tile = e.target;
        if (tile.dataset.isTarget === 'true') {
            tile.classList.add('correct');
            tile.style.pointerEvents = 'none'; // 중복 클릭 방지
            targetsToFind--;
            updateTargetInfo();

            // 점수 계산 (기획서 기반)
            const baseScore = 1000;
            const deltaMultiplier = (100 - STAGES[currentStage].Delta) / 100 + 1; // Delta가 작을수록 배수 증가
            const timeBonus = Math.round(timeLeft * 100);
            score += Math.round(baseScore * deltaMultiplier) + timeBonus;
            scoreInfo.textContent = score;

            if (targetsToFind === 0) {
                clearInterval(timerInterval);
                setTimeout(() => {
                    currentStage++;
                    if (currentStage >= STAGES.length) {
                        gameOver('Clear!', true);
                    } else {
                        loadStage(currentStage);
                    }
                }, 500);
            }
        } else {
            // 오답 페널티
            score = Math.max(0, score - 500);
            scoreInfo.textContent = score;
            gridContainer.classList.add('shake');
            setTimeout(() => gridContainer.classList.remove('shake'), 300);
        }
    }

    function loadStage(stageIndex) {
        currentStage = stageIndex;
        const { N, T, Delta } = STAGES[stageIndex];
        targetsToFind = T;

        // UI 업데이트
        stageInfo.textContent = `${stageIndex + 1} / ${STAGES.length}`;
        updateTargetInfo();

        // 색상 생성
        const { base, target } = generateColors(Delta);

        // 그리드 생성
        gridContainer.innerHTML = '';
        gridContainer.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
        gridContainer.style.gridTemplateRows = `repeat(${N}, 1fr)`;

        const totalTiles = N * N;
        const targetIndexes = new Set();
        while (targetIndexes.size < T) {
            targetIndexes.add(Math.floor(Math.random() * totalTiles));
        }

        for (let i = 0; i < totalTiles; i++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            if (targetIndexes.has(i)) {
                tile.style.backgroundColor = target;
                tile.dataset.isTarget = 'true';
            } else {
                tile.style.backgroundColor = base;
                tile.dataset.isTarget = 'false';
            }
            tile.addEventListener('click', handleTileClick);
            gridContainer.appendChild(tile);
        }

        startTimer();
    }

    function gameOver(message, isClear = false) {
        clearInterval(timerInterval);
        resultScreen.classList.remove('hidden');
        document.getElementById('result-title').textContent = message;
        document.getElementById('final-score').textContent = `Total Score: ${score}`;

        if (!isClear) {
            // 게임 오버 시 정답/오답 피드백 (기획서 5.2.1)
            const colorFeedback = document.getElementById('color-feedback');
            const correctTiles = document.querySelectorAll(".tile[data-is-target='true']");
            if (correctTiles.length > 0) {
                const correctColor = correctTiles[0].style.backgroundColor;
                const baseColor = document.querySelectorAll(".tile[data-is-target='false']")[0].style.backgroundColor;
                
                colorFeedback.innerHTML = `
                    <p>You missed this color difference:</p>
                    <div style="display: flex; justify-content: center; gap: 20px; align-items: center;">
                        <div>Base<div style="width: 50px; height: 50px; background-color: ${baseColor};"></div></div>
                        <div>Target<div style="width: 50px; height: 50px; background-color: ${correctColor};"></div></div>
                    </div>
                `;
                colorFeedback.classList.remove('hidden');
            }
        }
    }

    function startGame() {
        startScreen.classList.add('hidden');
        resultScreen.classList.add('hidden');
        document.getElementById('color-feedback').classList.add('hidden');
        score = 0;
        scoreInfo.textContent = '0';
        loadStage(0);
    }

    startButton.addEventListener('click', startGame);
    retryButton.addEventListener('click', startGame);
});