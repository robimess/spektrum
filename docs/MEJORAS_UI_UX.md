# Spektrum - Guía de Mejoras UI/UX

## Principios de Diseño

### 1. Performance Visual
- **60 FPS constante** en todas las visualizaciones
- Animaciones suaves con `requestAnimationFrame`
- Uso de `transform` y `opacity` para animaciones (GPU-accelerated)
- Evitar reflows y repaints innecesarios

### 2. Feedback Inmediato
- Respuesta visual instantánea a interacciones
- Loading states para operaciones async
- Skeleton screens durante carga inicial
- Toast notifications para confirmaciones

### 3. Accesibilidad
- Contraste WCAG AAA (7:1 para texto normal, 4.5:1 para texto grande)
- Keyboard navigation completa
- ARIA labels en todos los controles
- Focus visible y lógico

### 4. Responsive
- Mobile-first approach
- Breakpoints: 320px, 768px, 1024px, 1440px
- Touch targets mínimo 44x44px
- Gestos táctiles (pinch-to-zoom en spectrogram)

---

## Componentes UI Mejorados

### Spectrogram Canvas

**Mejoras implementadas**:
```typescript
// 1. High-DPI rendering
const dpr = window.devicePixelRatio || 1;
canvas.width = cssWidth * dpr;
canvas.height = cssHeight * dpr;
ctx.scale(dpr, dpr);

// 2. Desynchronized rendering para mejor performance
const ctx = canvas.getContext('2d', { 
  alpha: false,           // Sin canal alpha (más rápido)
  desynchronized: true    // No bloquea main thread
});

// 3. ResizeObserver en lugar de window resize event
this.resizeObserver = new ResizeObserver(() => {
  this.handleCanvasResize();
});
```

**Mejoras pendientes**:
- [ ] WebGL rendering para 10x mejor performance
- [ ] Worker thread para cálculos de color LUT
- [ ] Texture caching para paletas

---

### Bars View Component

**Mejoras implementadas**:
```typescript
// 1. ChangeDetectionStrategy.OnPush
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})

// 2. Servicios atomizados inyectados
constructor(
  private octaveBandService: OctaveBandService,
  private smoothingService: SignalSmoothingService
)

// 3. Nombres descriptivos
private spectrogramState: SpectrogramState;  // vs "state"
private bandCurrent: Float32Array;           // vs "bandNow"
```

**Mejoras pendientes**:
- [ ] Virtual scrolling para logs largos
- [ ] Lazy loading de imágenes/assets
- [ ] Memoization de cálculos repetidos

---

### Feedback Alert Component

**Estado actual** (a mejorar):
```html
<div *ngIf="feedbackEvent" class="feedback-alert">
  <p>Feedback en {{ feedbackEvent.frequency }}Hz</p>
</div>
```

**Mejoras recomendadas**:

```typescript
// 1. Animaciones suaves
@Component({
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})

// 2. Severidad visual
getSeverityClass(severity: FeedbackSeverity): string {
  return `feedback-alert--${severity}`;  // Clases específicas
}

// 3. Auto-dismiss configurable
private autoDismissTimer?: number;

showAlert(event: FeedbackEvent, duration = 5000) {
  this.currentEvent = event;
  
  if (this.autoDismissTimer) {
    clearTimeout(this.autoDismissTimer);
  }
  
  this.autoDismissTimer = setTimeout(() => {
    this.dismiss();
  }, duration);
}
```

**HTML mejorado**:
```html
<div 
  *ngIf="currentEvent" 
  [@slideIn]
  class="feedback-alert"
  [class]="getSeverityClass(currentEvent.severity)"
  role="alert"
  aria-live="assertive">
  
  <div class="feedback-alert__header">
    <ion-icon [name]="getSeverityIcon(currentEvent.severity)"></ion-icon>
    <span class="feedback-alert__title">{{ getSeverityLabel(currentEvent.severity) }}</span>
    <button 
      class="feedback-alert__close" 
      (click)="dismiss()"
      aria-label="Cerrar alerta">
      <ion-icon name="close"></ion-icon>
    </button>
  </div>
  
  <div class="feedback-alert__body">
    <div class="feedback-alert__frequency">
      {{ currentEvent.frequency | number:'1.0-1' }} Hz
      <span class="feedback-alert__band">({{ currentEvent.octaveBand }})</span>
    </div>
    
    <div class="feedback-alert__magnitude">
      {{ currentEvent.magnitudeDb | number:'1.1-1' }} dB
      <span class="feedback-alert__q">Q: {{ currentEvent.qFactor | number:'1.1-1' }}</span>
    </div>
  </div>
  
  <button 
    class="feedback-alert__action"
    (click)="openAISuggestion()"
    *ngIf="hasSuggestion">
    Ver sugerencia IA
    <ion-icon name="bulb-outline"></ion-icon>
  </button>
</div>
```

**SCSS mejorado**:
```scss
.feedback-alert {
  position: fixed;
  top: 80px;
  right: 16px;
  max-width: 320px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(10px);
  z-index: 1000;
  
  &--low {
    background: rgba(76, 175, 80, 0.95);
    border-left: 4px solid #4caf50;
  }
  
  &--medium {
    background: rgba(255, 193, 7, 0.95);
    border-left: 4px solid #ffc107;
    color: #000;
  }
  
  &--high {
    background: rgba(255, 152, 0, 0.95);
    border-left: 4px solid #ff9800;
  }
  
  &--critical {
    background: rgba(244, 67, 54, 0.95);
    border-left: 4px solid #f44336;
    animation: pulse 1s infinite;
  }
  
  &__header {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 8px;
  }
  
  &__title {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  &__close {
    background: transparent;
    border: none;
    padding: 4px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 150ms;
    
    &:hover {
      opacity: 1;
    }
  }
  
  &__body {
    padding: 0 16px 12px;
  }
  
  &__frequency {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  
  &__band {
    font-size: 14px;
    font-weight: 400;
    opacity: 0.8;
    margin-left: 8px;
  }
  
  &__magnitude {
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  &__q {
    font-size: 14px;
    opacity: 0.8;
  }
  
  &__action {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    border-radius: 0 0 12px 12px;
    color: inherit;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: background 150ms;
    
    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 8px 24px rgba(244, 67, 54, 0.4); }
  50% { box-shadow: 0 8px 32px rgba(244, 67, 54, 0.7); }
}
```

---

### Feedback Log Modal

**Mejoras recomendadas**:

```typescript
@Component({
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Registro de Feedback</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="exportCsv()">
            <ion-icon name="download-outline"></ion-icon>
          </ion-button>
          <ion-button (click)="dismiss()">
            <ion-icon name="close"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      
      <ion-toolbar>
        <ion-searchbar 
          [(ngModel)]="searchTerm"
          (ionInput)="filterLogs()"
          placeholder="Buscar por frecuencia...">
        </ion-searchbar>
        
        <ion-segment [(ngModel)]="filterSeverity" (ionChange)="filterLogs()">
          <ion-segment-button value="all">
            <ion-label>Todos</ion-label>
          </ion-segment-button>
          <ion-segment-button value="critical">
            <ion-label>Crítico</ion-label>
          </ion-segment-button>
          <ion-segment-button value="high">
            <ion-label>Alto</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>
    
    <ion-content>
      <!-- Stats Summary -->
      <div class="log-stats">
        <div class="log-stat">
          <span class="log-stat__value">{{ stats.totalEvents }}</span>
          <span class="log-stat__label">Total</span>
        </div>
        <div class="log-stat">
          <span class="log-stat__value">{{ stats.unresolvedCount }}</span>
          <span class="log-stat__label">Pendientes</span>
        </div>
        <div class="log-stat">
          <span class="log-stat__value">{{ stats.avgFrequency | number:'1.0-0' }} Hz</span>
          <span class="log-stat__label">Frecuencia promedio</span>
        </div>
        <div class="log-stat">
          <span class="log-stat__value">{{ stats.avgQFactor | number:'1.1-1' }}</span>
          <span class="log-stat__label">Q-Factor promedio</span>
        </div>
      </div>
      
      <!-- Virtual Scroll List -->
      <cdk-virtual-scroll-viewport itemSize="120" class="log-list">
        <div 
          *cdkVirtualFor="let entry of filteredLogs"
          class="log-entry"
          [class.log-entry--resolved]="entry.resolved">
          
          <div class="log-entry__header">
            <span 
              class="log-entry__severity"
              [class]="'log-entry__severity--' + entry.event.severity">
              {{ entry.event.severity }}
            </span>
            <span class="log-entry__time">
              {{ entry.event.timestamp | date:'short' }}
            </span>
          </div>
          
          <div class="log-entry__details">
            <div class="log-entry__frequency">
              {{ entry.event.frequency | number:'1.1-1' }} Hz
              <span class="log-entry__band">({{ entry.event.octaveBand }})</span>
            </div>
            <div class="log-entry__metrics">
              <span>{{ entry.event.magnitudeDb | number:'1.1-1' }} dB</span>
              <span>Q: {{ entry.event.qFactor | number:'1.1-1' }}</span>
              <span>{{ entry.event.duration }}ms</span>
            </div>
          </div>
          
          <div class="log-entry__actions">
            <ion-button 
              size="small" 
              fill="clear"
              (click)="toggleResolved(entry)">
              <ion-icon 
                [name]="entry.resolved ? 'checkmark-circle' : 'checkmark-circle-outline'">
              </ion-icon>
              {{ entry.resolved ? 'Resuelto' : 'Marcar resuelto' }}
            </ion-button>
            
            <ion-button 
              size="small" 
              fill="clear"
              (click)="addNote(entry)">
              <ion-icon name="create-outline"></ion-icon>
            </ion-button>
            
            <ion-button 
              size="small" 
              fill="clear"
              color="danger"
              (click)="deleteEntry(entry)">
              <ion-icon name="trash-outline"></ion-icon>
            </ion-button>
          </div>
          
          <div class="log-entry__note" *ngIf="entry.userNote">
            <ion-icon name="document-text-outline"></ion-icon>
            {{ entry.userNote }}
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
      
      <!-- Empty State -->
      <div class="log-empty" *ngIf="filteredLogs.length === 0">
        <ion-icon name="document-outline" size="large"></ion-icon>
        <p>No hay eventos registrados</p>
      </div>
    </ion-content>
  `
})
export class FeedbackLogModalComponent implements OnInit {
  filteredLogs: LogEntry[] = [];
  searchTerm = '';
  filterSeverity: 'all' | FeedbackSeverity = 'all';
  stats: any = {};
  
  constructor(
    private feedbackLog: FeedbackLogService,
    private modalCtrl: ModalController
  ) {}
  
  ngOnInit() {
    this.loadLogs();
    this.updateStats();
  }
  
  filterLogs() {
    let logs = this.feedbackLog.getLogs();
    
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      logs = logs.filter(entry => 
        entry.event.frequency.toString().includes(term) ||
        entry.event.octaveBand?.toLowerCase().includes(term)
      );
    }
    
    if (this.filterSeverity !== 'all') {
      logs = logs.filter(entry => 
        entry.event.severity === this.filterSeverity
      );
    }
    
    this.filteredLogs = logs;
  }
  
  exportCsv() {
    this.feedbackLog.downloadCsv();
  }
  
  async addNote(entry: LogEntry) {
    const alert = await this.alertCtrl.create({
      header: 'Agregar nota',
      inputs: [{
        name: 'note',
        type: 'textarea',
        value: entry.userNote || '',
        placeholder: 'Escribe una nota...'
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data) => {
            this.feedbackLog.updateEntry(entry.event.id, {
              userNote: data.note
            });
            this.loadLogs();
          }
        }
      ]
    });
    
    await alert.present();
  }
}
```

---

### Loading States

**Skeleton Screens** durante carga inicial:

```html
<div class="skeleton" *ngIf="isLoading">
  <div class="skeleton__canvas"></div>
  <div class="skeleton__controls">
    <div class="skeleton__button"></div>
    <div class="skeleton__button"></div>
    <div class="skeleton__button"></div>
  </div>
</div>
```

```scss
.skeleton {
  &__canvas {
    width: 100%;
    height: 240px;
    background: linear-gradient(
      90deg,
      #2a2a2a 0%,
      #3a3a3a 50%,
      #2a2a2a 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 8px;
  }
  
  &__button {
    width: 80px;
    height: 36px;
    background: linear-gradient(
      90deg,
      #2a2a2a 0%,
      #3a3a3a 50%,
      #2a2a2a 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
    margin: 8px;
  }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

### Toast Notifications

```typescript
@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private toastCtrl: ToastController) {}
  
  async showSuccess(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
      color: 'success',
      icon: 'checkmark-circle-outline'
    });
    await toast.present();
  }
  
  async showError(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color: 'danger',
      icon: 'alert-circle-outline'
    });
    await toast.present();
  }
  
  async showInfo(message: string, duration = 2000) {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      position: 'bottom',
      color: 'primary',
      icon: 'information-circle-outline'
    });
    await toast.present();
  }
}
```

---

### Performance Stats Overlay

```html
<div class="perf-stats" *ngIf="showPerformanceStats">
  <div class="perf-stat">
    <span class="perf-stat__label">FPS</span>
    <span class="perf-stat__value" [class.perf-stat__value--warning]="metrics.fps < 30">
      {{ metrics.fps }}
    </span>
  </div>
  
  <div class="perf-stat">
    <span class="perf-stat__label">Latency</span>
    <span class="perf-stat__value" [class.perf-stat__value--warning]="metrics.audioLatency > 50">
      {{ metrics.audioLatency | number:'1.0-0' }}ms
    </span>
  </div>
  
  <div class="perf-stat">
    <span class="perf-stat__label">CPU</span>
    <span class="perf-stat__value" [class.perf-stat__value--warning]="metrics.cpuUsage > 80">
      {{ metrics.cpuUsage | number:'1.0-0' }}%
    </span>
  </div>
  
  <div class="perf-stat">
    <span class="perf-stat__label">Memory</span>
    <span class="perf-stat__value">
      {{ metrics.memoryUsage | number:'1.0-0' }}MB
    </span>
  </div>
  
  <div class="perf-stat" *ngIf="metrics.droppedFrames > 0">
    <span class="perf-stat__label">Dropped</span>
    <span class="perf-stat__value perf-stat__value--warning">
      {{ metrics.droppedFrames }}
    </span>
  </div>
</div>
```

```scss
.perf-stats {
  position: fixed;
  top: 8px;
  left: 8px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  gap: 12px;
  font-family: 'Roboto Mono', monospace;
  font-size: 11px;
  z-index: 9999;
}

.perf-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  
  &__label {
    color: #999;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  
  &__value {
    color: #0f0;
    font-weight: 700;
    font-size: 14px;
    margin-top: 2px;
    
    &--warning {
      color: #f00;
      animation: blink 1s infinite;
    }
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Temas y Paletas

### Color Schemes

**Default (Viridis)**:
- Científicamente preciso
- Perceptualmente uniforme
- Alta discriminación de valores

**High Contrast**:
- Negro/blanco puro
- Para entornos con iluminación difícil
- Accesibilidad mejorada

**Thermal**:
- Negro → Rojo → Amarillo → Blanco
- Intuitivo para detección de "hot spots"
- Usado en cámaras térmicas

```typescript
export const COLOR_SCHEMES = {
  default: {
    background: '#000000',
    foreground: '#ffffff',
    accent: '#6aa7ff',
    warning: '#ffc107',
    danger: '#f44336'
  },
  highContrast: {
    background: '#000000',
    foreground: '#ffffff',
    accent: '#ffffff',
    warning: '#ffffff',
    danger: '#ffffff'
  },
  thermal: {
    background: '#000000',
    foreground: '#ff0000',
    accent: '#ffff00',
    warning: '#ff8800',
    danger: '#ff0000'
  }
};
```

---

## Accesibilidad (A11y)

### Keyboard Navigation

```typescript
@HostListener('keydown', ['$event'])
handleKeyboard(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      this.dismiss();
      break;
    case 'Enter':
    case ' ':
      if (this.focusedElement) {
        this.focusedElement.click();
      }
      break;
    case 'ArrowUp':
      event.preventDefault();
      this.increaseValue();
      break;
    case 'ArrowDown':
      event.preventDefault();
      this.decreaseValue();
      break;
  }
}
```

### ARIA Labels

```html
<button 
  aria-label="Aumentar ganancia"
  aria-describedby="gain-description"
  [attr.aria-pressed]="isActive">
  <ion-icon name="volume-high"></ion-icon>
</button>

<span id="gain-description" class="sr-only">
  Aumenta la ganancia del micrófono en 3 dB
</span>
```

### Screen Reader Support

```scss
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## Responsive Design

### Breakpoints

```scss
$breakpoint-mobile: 320px;
$breakpoint-tablet: 768px;
$breakpoint-desktop: 1024px;
$breakpoint-wide: 1440px;

@mixin mobile {
  @media (max-width: $breakpoint-tablet - 1) {
    @content;
  }
}

@mixin tablet {
  @media (min-width: $breakpoint-tablet) and (max-width: $breakpoint-desktop - 1) {
    @content;
  }
}

@mixin desktop {
  @media (min-width: $breakpoint-desktop) {
    @content;
  }
}
```

### Adaptive Layout

```scss
.home-page {
  display: grid;
  gap: 16px;
  padding: 16px;
  
  @include mobile {
    grid-template-columns: 1fr;
    grid-template-areas:
      "spectrogram"
      "controls"
      "feedback";
  }
  
  @include tablet {
    grid-template-columns: 2fr 1fr;
    grid-template-areas:
      "spectrogram controls"
      "feedback feedback";
  }
  
  @include desktop {
    grid-template-columns: 3fr 1fr 1fr;
    grid-template-areas:
      "spectrogram controls feedback";
  }
}
```

---

## Animaciones

### Entrada de Modales

```typescript
const modalEnterAnimation = (baseEl: HTMLElement) => {
  const backdropAnimation = createAnimation()
    .addElement(baseEl.querySelector('ion-backdrop')!)
    .fromTo('opacity', '0.01', 'var(--backdrop-opacity)');

  const wrapperAnimation = createAnimation()
    .addElement(baseEl.querySelector('.modal-wrapper')!)
    .keyframes([
      { offset: 0, opacity: '0', transform: 'scale(0.95) translateY(20px)' },
      { offset: 1, opacity: '1', transform: 'scale(1) translateY(0)' }
    ]);

  return createAnimation()
    .addElement(baseEl)
    .easing('ease-out')
    .duration(250)
    .addAnimation([backdropAnimation, wrapperAnimation]);
};
```

### Micro-interacciones

```scss
.button {
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  
  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  }
}
```

---

## Checklist de Implementación

### Componentes
- [x] BarsViewComponent refactorizado
- [x] HomePage refactorizado
- [ ] FeedbackAlertComponent mejorado
- [ ] FeedbackLogModalComponent con virtual scroll
- [ ] MicSelectorComponent optimizado
- [ ] PerformanceStatsOverlay creado

### Servicios UI
- [ ] ToastService implementado
- [ ] ModalAnimationsService
- [ ] ThemeService para gestión de temas

### Accesibilidad
- [ ] ARIA labels en todos los controles
- [ ] Keyboard navigation completa
- [ ] Focus management
- [ ] Screen reader testing

### Performance
- [ ] Virtual scrolling en listas largas
- [ ] Lazy loading de componentes
- [ ] Image optimization
- [ ] Bundle size analysis

### Responsive
- [ ] Mobile layout tested
- [ ] Tablet layout tested
- [ ] Desktop layout tested
- [ ] Touch gestures implemented

---

## Herramientas de Testing

### Visual Regression
```bash
npm install --save-dev @storybook/angular
npm install --save-dev chromatic
```

### Performance
```bash
npm install --save-dev lighthouse
npm install --save-dev web-vitals
```

### Accesibilidad
```bash
npm install --save-dev @axe-core/playwright
npm install --save-dev pa11y
```

---

## Referencias

- Material Design 3: https://m3.material.io/
- Ionic Framework: https://ionicframework.com/docs/
- Web Accessibility Initiative: https://www.w3.org/WAI/
- Google Web Vitals: https://web.dev/vitals/
