import numpy as np
import sounddevice as sd
import matplotlib.pyplot as plt
from scipy.fft import fft, fftfreq

FS = 48000
SEGUNDOS = 1
N = FS * SEGUNDOS

print("🎙️ Grabando...")
audio = sd.rec(int(N), samplerate=FS, channels=1, dtype='float64')
sd.wait()
print("✅ Grabación completa.")

y = audio.flatten() * np.hanning(len(audio.flatten()))
fft_result = np.abs(fft(y))[:N//2]
freqs = fftfreq(N, 1 / FS)[:N//2]

fc_1_3 = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125,
    160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000,
    5000, 6300, 8000, 10000, 12500, 16000
]

def energy_in_band(f_min, f_max, freqs, fft_vals):
    mask = (freqs >= f_min) & (freqs <= f_max)
    return np.sum(fft_vals[mask]**2)

energies_db = []
labels = []
for fc in fc_1_3:
    fmin = fc / (2**(1/6))
    fmax = fc * (2**(1/6))
    energy = energy_in_band(fmin, fmax, freqs, fft_result)
    db = 10 * np.log10(energy + 1e-8)
    energies_db.append(db)
    labels.append(str(fc))

plt.figure(figsize=(12, 5))
plt.bar(labels, energies_db, width=0.8)
plt.title("Energía por banda (1/3 de octava)")
plt.xlabel("Frecuencia central (Hz)")
plt.ylabel("Magnitud (dB)")
plt.xticks(rotation=45)
plt.grid(True)
plt.tight_layout()
plt.show()
