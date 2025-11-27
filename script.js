document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const screens = {
        mainMenu: document.getElementById('main-menu'),
        game: document.getElementById('game-screen'),
        result: document.getElementById('result-screen'),
        highscore: document.getElementById('highscore-screen')
    };

    const buttons = {
        start: document.getElementById('start-btn'),
        highscore: document.getElementById('highscore-btn'),
        retry: document.getElementById('retry-btn'),
        mainMenu: document.getElementById('main-menu-btn'),
        backToMain: document.getElementById('back-to-main-btn')
    };

    const displays = {
        stage: document.getElementById('stage'),
        targetsFound: document.getElementById('targets-found'),
        targetsTotal: document.getElementById('targets-total'),
        score: document.getElementById('score'),
        timerBar: document.getElementById('timer-bar'),
        finalScore: document.getElementById('final-score'),
        resultTitle: document.getElementById('result-title'),
        highscoreList: document.getElementById('highscore-list')
    };

    const gridContainer = document.getElementById('grid-container');

    // Game Configuration
    const STAGE_CONFIGS = [
        { gridSize: 7, targetCount: 1, colorDelta: 100 },
        { gridSize: 8, targetCount: 1, colorDelta: 90 },
        { gridSize: 9, targetCount: 1, colorDelta: 80 },
        { gridSize: 7, targetCount: 2, colorDelta: 70 },
        { gridSize: 8, targetCount: 2, colorDelta: 60 },
        { gridSize: 9, targetCount: 2, colorDelta: 50 },
        { gridSize: 7, targetCount: 3, colorDelta: 40 },
        { gridSize: 8, targetCount: 3, colorDelta: 25 },
        { gridSize: 9, targetCount: 3, colorDelta: 10 }
    ];
    const STAGE_TIME = 15; // seconds
    const PENALTY_TIME = 3; // seconds

    // Game State
    let currentStage = 0;
    let score = 0;
    let timeLeft = STAGE_TIME;
    let timerInterval = null;
    let foundTargets = 0;
    let highScores = JSON.parse(localStorage.getItem('chromaSeekHighScores')) || [];

    // --- Screen Management ---
    function showScreen(screenId) {
        Object.values(screens).forEach(screen => screen.style.display = 'none');
        screens[screenId].style.display = 'flex';
    }

    // --- Event Listeners ---
    buttons.start.addEventListener('click', startGame);
    buttons.retry.addEventListener('click', startGame);
    buttons.mainMenu.addEventListener('click', () => showScreen('mainMenu'));
    buttons.backToMain.addEventListener('click', () => showScreen('mainMenu'));
    buttons.highscore.addEventListener('click', showHighscoreScreen);
    gridContainer.addEventListener('click', handleTileClick);

    // --- Game Logic ---
    function startGame() {
        currentStage = 0;
        score = 0;
        displays.score.textContent = 0;
        startStage();
    }

    function startStage() {
        if (currentStage >= STAGE_CONFIGS.length) {
            endGame(true);
            return;
        }

        showScreen('game');
        const config = STAGE_CONFIGS[currentStage];
        foundTargets = 0;

        // Update UI
        displays.stage.textContent = `${currentStage + 1} / ${STAGE_CONFIGS.length}`;
        displays.targetsFound.textContent = foundTargets;
        displays.targetsTotal.textContent = config.targetCount;

        generateGrid(config);
        startTimer();
    }

    function generateGrid({ gridSize, targetCount, colorDelta }) {
        gridContainer.innerHTML = '';
        gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;

        // Color Generation
        const baseColor = {
            r: Math.floor(Math.random() * 256),
            g: Math.floor(Math.random() * 256),
            b: Math.floor(Math.random() * 256)
        };

        const targetColor = { ...baseColor };
        const channel = ['r', 'g', 'b'][Math.floor(Math.random() * 3)];
        const direction = Math.random() < 0.5 ? 1 : -1;
        targetColor[channel] = Math.max(0, Math.min(255, targetColor[channel] + (colorDelta * direction)));

        const baseColorStr = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
        const targetColorStr = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;

        // Target Placement
        const totalTiles = gridSize * gridSize;
        const targetIndexes = new Set();
        while (targetIndexes.size < targetCount) {
            targetIndexes.add(Math.floor(Math.random() * totalTiles));
        }

        // Create Tiles
        for (let i = 0; i < totalTiles; i++) {
            const tile = document.createElement('div');
            tile.classList.add('tile');
            if (targetIndexes.has(i)) {
                tile.style.backgroundColor = targetColorStr;
                tile.dataset.target = 'true';
            } else {
                tile.style.backgroundColor = baseColorStr;
            }
            gridContainer.appendChild(tile);
        }
    }

    function handleTileClick(e) {
        const clickedTile = e.target;
        if (!clickedTile.classList.contains('tile') || clickedTile.dataset.found) return;

        if (clickedTile.dataset.target === 'true') {
            foundTargets++;
            clickedTile.dataset.found = 'true';
            displays.targetsFound.textContent = foundTargets;
            
            // Add visual feedback
            const check = document.createElement('span');
            check.textContent = '✔';
            check.style.fontSize = `${clickedTile.offsetWidth / 2}px`;
            check.style.color = 'white';
            check.style.position = 'absolute';
            clickedTile.style.position = 'relative';
            clickedTile.style.display = 'flex';
            clickedTile.style.justifyContent = 'center';
            clickedTile.style.alignItems = 'center';
            clickedTile.appendChild(check);
            clickedTile.classList.add('correct-flash');


            const config = STAGE_CONFIGS[currentStage];
            if (foundTargets === config.targetCount) {
                updateScore();
                currentStage++;
                setTimeout(startStage, 500); // Wait for feedback animation
            }
        } else {
            timeLeft = Math.max(0, timeLeft - PENALTY_TIME);
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 300);
        }
    }

    // --- Timer ---
    function startTimer() {
        clearInterval(timerInterval);
        timeLeft = STAGE_TIME;
        displays.timerBar.style.transition = 'none';
        displays.timerBar.style.width = '100%';
        
        // Force reflow to apply transition reset immediately
        void displays.timerBar.offsetWidth; 

        displays.timerBar.style.transition = `width ${STAGE_TIME}s linear`;
        displays.timerBar.style.width = '0%';
        
        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                endGame(false);
            }
        }, 1000);
    }

    // --- Scoring & End Game ---
    function updateScore() {
        const config = STAGE_CONFIGS[currentStage];
        const baseScore = 1000;
        const deltaMultiplier = (110 - config.colorDelta) / 100;
        const timeBonus = Math.floor(timeLeft * 10);
        score += Math.floor(baseScore * deltaMultiplier) + timeBonus;
        displays.score.textContent = score;
    }

    function endGame(isCleared) {
        clearInterval(timerInterval);
        displays.finalScore.textContent = score;
        if (isCleared) {
            displays.resultTitle.textContent = "All Clear!";
        } else {
            displays.resultTitle.textContent = "Game Over";
        }
        saveHighScore(score, currentStage + (isCleared ? 1 : 0));
        showScreen('result');
    }

    function saveHighScore(finalScore, stageReached) {
        if (finalScore === 0) return;
        const newScore = { score: finalScore, stage: stageReached };
        highScores.push(newScore);
        highScores.sort((a, b) => b.score - a.score);
        highScores.splice(5); // Keep only top 5
        localStorage.setItem('chromaSeekHighScores', JSON.stringify(highScores));
    }

    function showHighscoreScreen() {
        displays.highscoreList.innerHTML = '';
        if (highScores.length === 0) {
            displays.highscoreList.innerHTML = '<li>No scores yet!</li>';
        } else {
            highScores.forEach(score => {
                const li = document.createElement('li');
                li.innerHTML = `<span>Score: ${score.score}</span> <span>Stage: ${score.stage}</span>`;
                displays.highscoreList.appendChild(li);
            });
        }
        showScreen('highscore');
    }

    // Initial Screen
    showScreen('mainMenu');
});
