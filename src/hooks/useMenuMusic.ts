import { useEffect, useRef } from 'react'
import { MENU_MUSIC_URL } from '../game/constants'

/**
 * Toca em loop no menu. Em navegadores com autoplay bloqueado, tenta de novo no primeiro clique.
 */
export function useMenuMusic(active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const triedUnlock = useRef(false)

  useEffect(() => {
    if (!active) {
      const a = audioRef.current
      if (a) {
        a.pause()
        a.src = ''
        audioRef.current = null
      }
      triedUnlock.current = false
      return
    }

    const audio = new Audio(MENU_MUSIC_URL)
    audio.loop = true
    audio.volume = 0.32
    audioRef.current = audio

    const tryPlay = () => {
      void audio.play().catch(() => {})
    }
    tryPlay()

    const unlock = () => {
      if (triedUnlock.current) return
      triedUnlock.current = true
      tryPlay()
    }

    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [active])
}
