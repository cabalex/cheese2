const wordsBody = document.getElementById('letters');
const wordsSlots = document.getElementById('letterSlots');
const submitBtn = document.getElementById('submitWord');
const score = document.getElementById('score');
const wordCount = document.getElementById('words');
const pointScale = [0, 0, 200, 300, 400, 800, 1400];
const time = document.getElementById('time');
const wordLength = 6;
const words = 

function setupGame() {
    "he"
}

function onLoad() {
    
}

document.addEventListener('load', onLoad());

const endpoint = 'https://cheese2api.azurewebsites.net/api';

class AnagramsApp {
    constructor() {
        for (let i = 0; i < wordLength; i++) {
            let div = document.createElement('div');
            div.className = 'letterSlot';
            wordsSlots.appendChild(div);
        }

        let urlParams = new URLSearchParams(window.location.search);
        this.gameID = urlParams.get('id');
        this.userID = urlParams.get('us');

        this.userWords = [];
        this.words = [];
        this.points = 0;

        this.currentLetterPlacement = [];
        this.currentLetters = [];

        document.getElementById('anagrams-game').style.display = 'none';
        document.getElementById('startGame').style.opacity = 0.5;

        this.load().then(() => {
            this.connectToServer()
                .catch((err) => {
                    document.getElementById('connecting').style.display = 'none';
                    if (err.message === '400') {
                        document.getElementById('sent').style.display = 'block';
                    } else {
                        document.getElementById('nogame').style.display = 'block';
                    }
                })
        });
    }

    async load() {
        // load words list
        let resp = await fetch(`./words.txt`).catch(() => {});

        if (resp) {
            let text = await resp.text();
            this.words = text.split('\r\n');
        } else {
            this.words = [];
        }
    }

    async connectToServer() {
        if (!this.gameID || !this.userID) throw new Error('No Game ID or User specified');

        let resp = await fetch(`${endpoint}/fetchSession/${this.gameID}/${this.userID}`).catch(() => {})

        if (!resp.ok) throw new Error(resp.status.toString());
        
        let json = await resp.json()
        document.getElementById('connecting').style.display = 'none';
        

        // change stuff here
        if (!json.data.completed) {
            document.getElementById('modal').style.display = 'none';
            this.word = json.word;
            this.initializeGameplay();
        } else {
            document.getElementById('sent').style.display = 'block';
        }
        
    }

    async sendOut() {
        document.getElementById('modal').style.display = 'block';
        document.getElementById('waiting').style.display = 'block';

        // Don't update in the background - waste!
        if (!document.hasFocus()) {
            setTimeout(this.sendOut.bind(this), 3000);
            return;
        }

        let resp = await fetch(`${endpoint}/updateSession/${this.gameID}/${this.userID}`, {
            method: 'POST',
            body: JSON.stringify({
                words: this.userWords
            })
        }).catch(() => {})

        if (!resp) {
            document.getElementById('waiting').style.display = 'none';
            document.getElementById('nogame').style.display = 'block';
            return;
        }
        if (!resp.ok) {
            if (resp.status !== 400) {
                setTimeout(this.sendOut.bind(this), 3000);
            }
            return;
        } else {
            document.getElementById('waiting').style.display = 'none';
            document.getElementById('sent').style.display = 'block';
        }
    }

    initializeGameplay() {
        submitBtn.style.opacity = 0.5;
        document.getElementById('startGame').style.opacity = 1;
        document.getElementById('startGame').addEventListener('click', () => {
            document.getElementById('anagrams-game').style.display = 'flex';
            document.getElementById('anagrams-initial').style.display = 'none';
            this.beginGameplay();
        })
    }

    placeLetter(letter) {
        let index = parseInt(letter.id.split('-')[1]);
        let screenPos = window.innerWidth > 500 ? 80 : (window.innerWidth - 10) / 6;
        if (!this.currentLetterPlacement.includes(letter)) {
            // add it to the current letter placement
            this.currentLetterPlacement.push(letter);
            let indexInArray = this.currentLetterPlacement.length - 1;
            letter.style.transform = `translateY(-90px) translateX(${(indexInArray - index) * screenPos}px)`;
        } else {
            // remove it from the current letter placement
            this.currentLetterPlacement.splice(this.currentLetterPlacement.indexOf(letter), 1);
            letter.style.transform = '';
        }

        if (this.currentLetterPlacement.length > 1) {
            submitBtn.style.opacity = 1;
        } else {
            submitBtn.style.opacity = 0.5;
        }
    }

    // START gameplay and play back opponents actions
    async beginGameplay() {
        this.startTime = Date.now() + 60_000;
        this.timerInterval = setInterval(() => {
            time.innerText = this.startTime - Date.now() > 59_400 ?
                '1:00' :
                `0:${Math.round(Math.max((this.startTime - Date.now()) / 1000, 0)).toString().padStart(2, '0')}`;
            
            if (this.startTime - Date.now() < 0) {
                this.endGameplay();
            }
        }, 100);

        for (let i = 0; i < this.word.length; i++) {
            let div = document.createElement('div');
            div.className = 'letter';
            div.id = `letter-${i}`;
            div.innerText = this.word[i];
            div.addEventListener('click', () => {
                this.placeLetter(div);
            })
            wordsBody.appendChild(div);
            this.currentLetters.push(div);
        }

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.submitWord();
            } else if (e.key === 'Backspace') {
                if (this.currentLetterPlacement.length > 0) {
                    let lastLetter = this.currentLetterPlacement.pop();
                    lastLetter.style.transform = '';
                }
            } else if (e.keyCode >= 48 && e.keyCode <= 57) {
                let index = parseInt(e.key);
                if (index <= this.currentLetters.length) {
                    this.placeLetter(this.currentLetters[index - 1]);
                }
            } else if (e.key.length === 1) {
                let possibleLetters = this.currentLetters.filter(letter => letter.innerText === e.key && !letter.style.transform);
                if (possibleLetters.length > 0) {
                    this.placeLetter(possibleLetters[0]);
                }
            }
        })

        document.getElementById('submitWord').addEventListener('click', this.submitWord.bind(this))
    }

    submitWord() {
        if (this.currentLetterPlacement.length > 1) {
            let word = this.currentLetterPlacement.map(letter => letter.innerText).join("");
            
            if (this.userWords.includes(word)) {
                this.popupMessage('red', `${word} already used`)
            } else if (this.words.includes(word)) {
                this.userWords.push(word);
                this.popupMessage('green', `${word} (+${pointScale[word.length]})`)
                this.points += pointScale[word.length];
            } else {
                this.popupMessage('red', `${word} not a word`)
            }


            this.currentLetterPlacement.forEach(letter => letter.style.transform = '');
            this.currentLetterPlacement = [];
            submitBtn.style.opacity = 0.5;
            score.innerText = this.points;
            wordCount.innerText = this.userWords.length;
        }
    }

    popupMessage(color, text) {
        let popup = document.createElement('div');
        popup.className = 'popup';
        popup.style.color = color;
        popup.innerText = text;
        document.body.appendChild(popup);
        setTimeout(() => {
            popup.remove();
        }, 1000);
    }

    async endGameplay() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        await this.sendOut();
    }

}

document.addEventListener('touchmove', (event) => {event.preventDefault()}, {passive: false});

window.onload = function() {
    new AnagramsApp();
}