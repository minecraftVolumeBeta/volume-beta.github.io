let playlist = [];
let currentIndex = 0;

const songTitle = document.getElementById('songTitle');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const progressBar = document.getElementById('progressBar');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const iframeElement = document.getElementById('scWidget');
const widget = SC.Widget(iframeElement);

function formatTime(ms) {
    if (!ms || isNaN(ms)) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Fetch playlist.json
fetch('playlist.json')
    .then(res => res.json())
    .then(data => {
        playlist = data;
        if (playlist.length > 0) {
            loadTrack(0, false);
        }
    })
    .catch(err => {
        songTitle.textContent = "Error loading playlist";
        console.error(err);
    });

function loadTrack(index, autoPlay = true) {
    currentIndex = index;
    const item = playlist[currentIndex];
    
    songTitle.textContent = "Loading track...";
    currentTimeEl.textContent = "0:00";
    durationEl.textContent = "0:00";
    progressBar.value = 0;

    widget.load(item.url, {
        auto_play: autoPlay,
        show_artwork: false,
        callback: () => {
            widget.getCurrentSound(sound => {
                if (sound) {
                    songTitle.textContent = `${sound.user.username} - ${sound.title}`;
                    if (sound.duration) {
                        durationEl.textContent = formatTime(sound.duration);
                    }
                }
            });
        }
    });
}

widget.bind(SC.Widget.Events.PLAY_PROGRESS, data => {
    if (data.soundDuration && data.soundDuration > 0) {
        const pct = (data.currentPosition / data.soundDuration) * 100;
        progressBar.value = pct;
        currentTimeEl.textContent = formatTime(data.currentPosition);
        durationEl.textContent = formatTime(data.soundDuration);
    }
});

playBtn.addEventListener('click', () => {
    widget.toggle();
});

widget.bind(SC.Widget.Events.PLAY, () => {
    playBtn.textContent = "❚❚";
});

widget.bind(SC.Widget.Events.PAUSE, () => {
    playBtn.textContent = "▶";
});

nextBtn.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % playlist.length;
    loadTrack(currentIndex, true);
});

prevBtn.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    loadTrack(currentIndex, true);
});

// Time & progress updates
widget.bind(SC.Widget.Events.PLAY_PROGRESS, data => {
    const pct = (data.currentPosition / data.soundDuration) * 100;
    progressBar.value = pct;
    currentTimeEl.textContent = formatTime(data.currentPosition);
    durationEl.textContent = formatTime(data.soundDuration);
});

progressBar.addEventListener('input', () => {
    widget.getDuration(duration => {
        if (duration && duration > 0) {
            const seekToMs = (progressBar.value / 100) * duration;
            widget.seekTo(seekToMs);
        }
    });
});

widget.bind(SC.Widget.Events.FINISH, () => {
    nextBtn.click();
});