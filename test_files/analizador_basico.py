import numpy as np
import sounddevice as sd
import matplotlib.pyplot as plt
from scipy.fft import fft, fftfreq

SEGUNDOS = 1
FS = 48000
N = SEGUNDOS * FS

print("🎙️ Grabando...")
audio = sd.rec(int(N), samplerate=FS, channels=1, dtype='float64')
sd.wait()
print("✅ Grabación completa.")

y = audio.flatten()
window = np.hanning(len(y))
y_windowed = y * window
fft_result = np.abs(fft(y_windowed))[:N//2]
freqs = fftfreq(N, 1 / FS)[:N//2]

idx_peak = np.argmax(fft_result)
freq_peak = freqs[idx_peak]
print(f"🔊 Pico detectado en: {freq_peak:.1f} Hz")

plt.figure(figsize=(10, 5))
plt.plot(freqs, 20 * np.log10(fft_result + 1e-8))  # dB
plt.title(f"Espectro de frecuencia (Pico: {freq_peak:.1f} Hz)")
plt.xlabel("Frecuencia (Hz)")
plt.ylabel("Magnitud (dB)")
plt.grid(True)
plt.xlim(20, 20000)
plt.xscale("log")
plt.show()
