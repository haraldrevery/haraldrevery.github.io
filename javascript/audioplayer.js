function audioPlayer() {
  return {
    volume: 0.7,
    previousVolume: 0.7,
    isMuted: false,
    isPlaying: false,
    isDraggingProgress: false,
    currentTime: 0,
    duration: 0,
    currentIndex: 0,
    audio: new Audio(),
    isIOS: false,
    hasError: false,
    isLoading: false,
    
    // color1 = start color, color2 = current time color
    tracks: [
      {
        title: "Phrases",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Phrases.mp3",
        color1: "#f97316",
        color2: "#e11d48",
        btnColor: "bg-gradient-to-br from-orange-500 to-rose-600"
      },
      {
        title: "Forest Rain",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Forest_Rain.mp3",
        color1: "#8f9c4b",
        color2: "#f9f9f9",
        btnColor: "bg-gradient-to-br from-white via-green-100 to-green-500"
      },
      {
        title: "Looking for Snow",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Looking_For_Snow.mp3",
        color1: "#3f535e",
        color2: "#f9f9f9",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
      {
        title: "Uninhabited Island",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Uninhabited_Island.mp3",
        color1: "#090c10",
        color2: "#2d965c",
        btnColor: "bg-gradient-to-br from-[#090c10] to-[#2d965c]"
      },
      {
        title: "Clouds and Roads",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Clouds_and_Roads.mp3",
        color1: "#24a4b9",
        color2: "#036e7f",
        btnColor: "bg-gradient-to-br from-[#24a4b9] to-[#036e7f]"
      },
      {
        title: "Isolated",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Isolated.mp3",
        color1: "#f9f9f9",
        color2: "#3f535e",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
      {
        title: "Mystery Card",
        artist: "Harald Revery",
        url: "./music/Harald_Revery_-_Mystery_Card.mp3",
        color1: "#a8aebd",
        color2: "#e5e9ec",
        btnColor: "bg-gradient-to-br from-white to-sky-400"
      },
      {
        title: "The North",
        artist: "Harald Revery & Light Titum",
        url: "./music/Harald_Revery_and_Light_Titum_-_The_North.mp3",
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
        // Play with error handling for iOS autoplay restrictions
        this.playWithErrorHandling();
      }
    },

    loadTrack() {
      this.hasError = false;
      this.isLoading = true;
      this.audio.src = this.tracks[this.currentIndex].url;
      this.audio.load();
      // Reset progress
      this.currentTime = 0;
    },
    
    // FIX #1: Handle iOS autoplay restrictions with promise-based error handling
    playWithErrorHandling() {
      const playPromise = this.audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Playback started successfully
            this.isPlaying = true;
            this.hasError = false;
          })
          .catch(error => {
            // Autoplay was prevented (common on iOS)
            console.warn('Playback prevented:', error);
            this.isPlaying = false;
            // Don't show error for autoplay prevention - it's expected behavior
            // User will need to manually click play
          });
      } else {
        // Older browsers that don't return a promise
        this.isPlaying = true;
      }
    },
    
    toggleMute() {
      // FIX #3: Only attempt to change volume if not on iOS
      if (this.isIOS) {
        // Volume control not available on iOS - do nothing
        return;
      }
      
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
      // Detect iOS
      this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      this.loadTrack();
      
      // Only set volume if not iOS
      if (!this.isIOS) {
        this.audio.volume = this.volume;
      }
      
      // Time update handler
      this.audio.ontimeupdate = () => { 
        if (!this.isDraggingProgress) {
          this.currentTime = this.audio.currentTime;
        }
      };
      
      // Duration loaded handler
      this.audio.onloadedmetadata = () => { 
        this.duration = this.audio.duration;
        this.isLoading = false;
      };
      
      // Track ended handler - use error handling for auto-advance
      this.audio.onended = () => { 
        this.next();
      };
      
      // FIX #2: Add error handler for failed audio loads
      this.audio.onerror = (e) => {
        console.error('Audio loading error:', e);
        this.hasError = true;
        this.isPlaying = false;
        this.isLoading = false;
      };
      
      // Additional useful handlers for iOS
      this.audio.onwaiting = () => {
        this.isLoading = true;
      };
      
      this.audio.oncanplay = () => {
        this.isLoading = false;
      };
      
      this.audio.onstalled = () => {
        this.isLoading = true;
      };
    },
    
    togglePlay() {
      if (this.isPlaying) {
        this.audio.pause();
        this.isPlaying = false;
      } else {
        // Use error handling for play
        this.playWithErrorHandling();
      }
    },
    
    next() {
      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
      this.loadTrack();
      // Only auto-play if already playing
      if (this.isPlaying) {
        this.playWithErrorHandling();
      }
    },
    
    previous() {
      this.currentIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
      this.loadTrack();
      // Only auto-play if already playing
      if (this.isPlaying) {
        this.playWithErrorHandling();
      }
    },
    
    formatTime(seconds) {
      if (isNaN(seconds)) return "0:00";
      let min = Math.floor(seconds / 60);
      let sec = Math.floor(seconds % 60);
      return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    },
    
    // FIX #4: Add touch event support for mobile devices
    seek(e) {
      const rect = e.currentTarget.getBoundingClientRect();
      
      // Support both mouse and touch events
      let clientX;
      if (e.type.startsWith('touch')) {
        clientX = e.touches[0]?.clientX || e.changedTouches[0]?.clientX;
      } else {
        clientX = e.clientX;
      }
      
      const x = clientX - rect.left;
      const percent = Math.min(Math.max(x / rect.width, 0), 1);
      this.currentTime = percent * this.duration;
      this.audio.currentTime = this.currentTime;
    },
    
    // FIX #6: Implement proper drag functionality
    startDrag(e) {
      this.isDraggingProgress = true;
      this.seek(e);
    },
    
    drag(e) {
      if (this.isDraggingProgress) {
        this.seek(e);
      }
    },
    
    stopDrag(e) {
      if (this.isDraggingProgress) {
        this.seek(e);
        this.isDraggingProgress = false;
      }
    },
    
    // Volume control with iOS detection
    setVolume(e) {
      if (this.isIOS) {
        return; // Volume not controllable on iOS
      }
      
      const rect = e.currentTarget.getBoundingClientRect();
      
      // Support both mouse and touch events
      let clientX;
      if (e.type.startsWith('touch')) {
        clientX = e.touches[0]?.clientX || e.changedTouches[0]?.clientX;
      } else {
        clientX = e.clientX;
      }
      
      const x = clientX - rect.left;
      const percent = Math.min(Math.max(x / rect.width, 0), 1);
      this.volume = percent;
      this.audio.volume = percent;
      this.isMuted = percent === 0;
    }
  }
}
