function audioPlayer() {
  return {
    volume: 0.7,
    previousVolume: 0.7,
    isMuted: false,
    isPlaying: false,
    isDragging: false,
    currentTime: 0,
    duration: 0,
    volume: 0.7,
    currentIndex: 0,
    audio: new Audio(),
    // color1 = start color, color2 = current time color
    tracks: [
      {
        title: "Phrases",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Phrases.mp3",
        color1: "#f97316",
        color2: "#e11d48",
        btnColor: "bg-gradient-to-br from-orange-500 to-rose-600"
      },
      {
        title: "Forest Rain",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Forest_Rain.mp3",
        color1: "#8f9c4b",
        color2: "#f9f9f9",
        btnColor: "bg-gradient-to-br from-white via-green-100 to-green-500"
      },
      {
        title: "Looking for Snow",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Looking_For_Snow.mp3",
        color1: "#3f535e",
        color2: "#f9f9f9",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
      {
        title: "Uninhabited Island",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Uninhabited_Island.mp3",
        color1: "#090c10",
        color2: "#2d965c",
        btnColor: "bg-gradient-to-br from-[#090c10] to-[#2d965c]"
      },
      {
        title: "Clouds and Roads",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Clouds_and_Roads.mp3",
        color1: "#24a4b9",
        color2: "#036e7f",
        btnColor: "bg-gradient-to-br from-[#24a4b9] to-[#036e7f]"
      },
      {
        title: "Isolated",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Isolated.mp3",
        color1: "#f9f9f9",
        color2: "#3f535e",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
       {
        title: "Mystery Card",
        artist: "Harald Revery",
        url: "./music/mp3/Harald_Revery_-_Mystery_Card.mp3",
        color1: "#a8aebd",
        color2: "#e5e9ec",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
       {
        title: "The North",
        artist: "Harald Revery & Light Titum",
        url: "./music/mp3/Harald_Revery_and_Light_Titum_-_The_North.mp3",
        color1: "#f9f9f9",
        color2: "#3f535e",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
    ],
      selectTrack(index) {
      if (this.currentIndex === index) {
        this.togglePlay();
      } else {
        this.currentIndex = index;
        this.loadTrack();
        this.audio.play();
        this.isPlaying = true;
      }
    },

    // Ensure your loadTrack method is present to update the source
    loadTrack() {
      this.audio.src = this.tracks[this.currentIndex].url;
      this.audio.load();
      // Reset progress
      this.currentTime = 0;
    },
    toggleMute() {
      if (this.isMuted) {
        this.volume = this.previousVolume || 0.7;
        this.audio.volume = this.volume;
        this.isMuted = false;
      } else {
        this.previousVolume = this.volume;
        this.volume = 0;
        this.audio.volume = 0;
        this.isMuted = true;
      }
    },
    init() {
      this.loadTrack();
      this.audio.volume = this.volume;
      this.audio.ontimeupdate = () => { if(!this.isDragging) this.currentTime = this.audio.currentTime };
      this.audio.onloadedmetadata = () => { this.duration = this.audio.duration };
      this.audio.onended = () => { this.next() };
    },
    loadTrack() {
      this.audio.src = this.tracks[this.currentIndex].url;
      this.audio.load();
    },
    togglePlay() {
      if (this.isPlaying) {
        this.audio.pause();
      } else {
        this.audio.play();
      }
      this.isPlaying = !this.isPlaying;
    },
    next() {
      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
      this.loadTrack();
      if (this.isPlaying) this.audio.play();
    },
    previous() {
      this.currentIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
      this.loadTrack();
      if (this.isPlaying) this.audio.play();
    },
    formatTime(seconds) {
      if (isNaN(seconds)) return "0:00";
      let min = Math.floor(seconds / 60);
      let sec = Math.floor(seconds % 60);
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    },
    seek(e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.min(Math.max(x / rect.width, 0), 1);
      this.currentTime = percent * this.duration;
      this.audio.currentTime = this.currentTime;
    }
  }
}
