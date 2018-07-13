function formatTime(date: Date): string {
  const hours = date.getHours().toString();
  const minutes = ('00' + date.getMinutes().toString()).slice(-2);
  return `${hours}:${minutes}`;
}

interface SubClockEntry {
  placeId: string;
  name: string;
  formattedAddress: string;
  utcOffsetInMinuts: number;
  sortOrder: number;
}

// --- Storage

const SUBCLOCKS_STORE_NAME = 'subclocks';

class SubClocksStore {
  private db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  getEntries(): Promise<Array<SubClockEntry>> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(SUBCLOCKS_STORE_NAME, 'readonly');
      const objectStore = transaction.objectStore(SUBCLOCKS_STORE_NAME);
      const entries = new Array<SubClockEntry>();
      const cursor = objectStore.openCursor();
      cursor.onsuccess = e => {
        const target = e.target as IDBRequest;
        if (target.result) {
          entries.push(target.result.value);
          target.result.continue();
        } else {
          resolve(entries);
        }
      };
      cursor.onerror = e => reject(e);
    });
  }

  addEntry(entry: SubClockEntry): Promise<void> {
    const transaction = this.db.transaction(SUBCLOCKS_STORE_NAME, 'readwrite');
    const objectStore = transaction.objectStore(SUBCLOCKS_STORE_NAME);
    const request = objectStore.add(entry);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = reject;
    });
  }

  removeEntry(entry: SubClockEntry): Promise<void> {
    const transaction = this.db.transaction(SUBCLOCKS_STORE_NAME, 'readwrite');
    const objectStore = transaction.objectStore(SUBCLOCKS_STORE_NAME);
    const request = objectStore.delete(entry.placeId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = reject;
    });
  }

  storeEntries(entries: Array<SubClockEntry>): Promise<void> {
    const transaction = this.db.transaction(SUBCLOCKS_STORE_NAME, 'readwrite');
    const objectStore = transaction.objectStore(SUBCLOCKS_STORE_NAME);
    return this.clearStore(objectStore).then(() => this.addEntries(entries, objectStore));
  }

  private clearStore(store: IDBObjectStore) {
    const request = store.clear();
    return new Promise((resolve, reject) => {
      request.onsuccess = e => resolve(e);
      request.onerror = e => reject(e);
    });
  }

  private async addEntries(entries: Array<SubClockEntry>, store: IDBObjectStore) {
    const addEntry = (entry: SubClockEntry) => {
      return new Promise((resolve, reject) => {
        const request = store.add(entry);
        request.onsuccess = e => resolve(e);
        request.onerror = e => reject(e);
      });
    };
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      await addEntry(entry);
    }
  }
}

function createSubClocksStore(): Promise<SubClocksStore> {
  const STORE_DB_NAME = 'clock';
  const STORE_DB_VERSION = 1;

  const request = indexedDB.open(STORE_DB_NAME, STORE_DB_VERSION);
  return new Promise((resolve, reject) => {
    request.onerror = e => reject(e);
    request.onupgradeneeded = e => {
      const db = request.result as IDBDatabase;
      db.createObjectStore(SUBCLOCKS_STORE_NAME, { keyPath: 'placeId' });
    };
    request.onsuccess = () => resolve(new SubClocksStore(request.result));
  });
}

// --- APIs

declare const google: any;

function placeDetails(placeId: string): Promise<any> {
  const div = document.createElement('div');
  const service: any = new google.maps.places.PlacesService(div);
  const request = { placeId: placeId };
  return new Promise((resolve, reject) => {
    service.getDetails(request, (place: any, status: string) => {
      if (status !== 'OK') {
        reject(status);
      }
      resolve(place);
    });
  });
}

function getCityEntry(description: string, placeId: string): Promise<SubClockEntry> {
  return placeDetails(placeId).then(detail => {
    return {
      placeId: placeId,
      name: detail.name,
      formattedAddress: detail.formatted_address,
      description: description,
      utcOffsetInMinuts: detail.utc_offset,
      sortOrder: Date.now()
    };
  });
}

// --- New SubClock

// TODO: Hide the pane when pressed esc key

class SubClockAddPane {
  private app: App;
  private el: HTMLElement;
  private queryEl: HTMLInputElement;
  private autocomplete: any; // Google Places Autocomplete.

  constructor(app: App) {
    this.app = app;
    this.el = document.querySelector('.add-subclock-pane') as HTMLElement;
    this.el.hidden = true;

    this.queryEl = this.el.querySelector('.city-autocomplete-field') as HTMLInputElement;
    const options = {
      types: ['(cities)']
    };
    this.autocomplete = new google.maps.places.Autocomplete(this.queryEl, options);
    google.maps.event.addListener(this.autocomplete, 'place_changed', () => this.placeChanged());
  }

  show() {
    this.el.hidden = false;
    this.queryEl.focus();
  }

  hide() {
    this.el.hidden = true;
  }

  private placeChanged() {
    const place = this.autocomplete.getPlace();
    if (!place || !place.place_id) {
      return;
    }
    const entry = {
      placeId: place.place_id,
      name: place.name,
      formattedAddress: place.formatted_address,
      utcOffsetInMinuts: place.utc_offset,
      sortOrder: Date.now()
    };
    this.app.addSubClock(entry);
    this.queryEl.value = '';
  }
}

// --- App

class App {
  private subclocks: Array<SubClockEntry>;
  private subClocksStore: SubClocksStore;

  private previousDate?: Date;
  private showSettings: boolean;

  private addPane: SubClockAddPane;

  constructor(subclocks: Array<SubClockEntry>, subClocksStore: SubClocksStore) {
    this.subclocks = subclocks;
    this.subclocks.sort((a, b) => a.sortOrder - b.sortOrder);
    this.subClocksStore = subClocksStore;

    this.addPane = new SubClockAddPane(this);
    this.showSettings = false;

    const settingsIcon = document.querySelector('.settings-icon')!;
    settingsIcon.addEventListener('click', e => {
      this.toggleSettings();
    });
  }

  start() {
    this.update();
  }

  addSubClock(entry: SubClockEntry) {
    this.subclocks.push(entry);
    this.subClocksStore.addEntry(entry).then(() => this.invalidate());
  }

  removeSubClock(target: SubClockEntry) {
    const subclocks = [];
    for (let entry of this.subclocks) {
      if (entry.placeId !== target.placeId) {
        subclocks.push(entry);
      }
    }
    this.subclocks = subclocks;
    this.subClocksStore.removeEntry(target).then(() => this.invalidate());
  }

  toggleSettings() {
    const actionEls = document.querySelectorAll('.subclock-actions');

    this.showSettings = !this.showSettings;
    if (this.showSettings) {
      this.addPane.show();
      actionEls.forEach(el => el.classList.remove('actions-hidden'));
    } else {
      this.addPane.hide();
      actionEls.forEach(el => el.classList.add('actions-hidden'));
    }
  }

  private update() {
    const date = new Date();
    if (!this.previousDate || this.previousDate.getMinutes() !== date.getMinutes()) {
      this.updateMainClock(date);
      this.updateSubClocks(date);
    }
    this.previousDate = date;
    setTimeout(() => this.update(), 1000);
  }

  private updateMainClock(date: Date) {
    const mainClockTime = document.querySelector('.main-clock-time')!;
    mainClockTime.textContent = formatTime(date);

    const mainClockDate = document.querySelector('.main-clock-date')!;
    mainClockDate.textContent = date.toDateString();
  }

  private updateSubClocks(date: Date) {
    const subclockListEl = document.querySelector('.subclock-list')!;
    subclockListEl.innerHTML = '';
    for (let entry of this.subclocks) {
      const subclockEl = this.createSubClock(date, entry);
      subclockListEl.appendChild(subclockEl);
    }
  }

  private createSubClock(date: Date, entry: SubClockEntry): HTMLElement {
    const offset = date.getTimezoneOffset() + entry.utcOffsetInMinuts;
    const cityDate = new Date(date.getTime() + offset * 60 * 1000);

    let timeDifferenceContent = '';
    if (date.getTimezoneOffset() != entry.utcOffsetInMinuts) {
      if (date.getDate() < cityDate.getDate()) {
        timeDifferenceContent = 'Tomorrow, ';
      } else if (date.getDate() > cityDate.getDate()) {
        timeDifferenceContent = 'Yesterday, ';
      }
    }
    if (offset > 0) {
      timeDifferenceContent += '+';
    }
    timeDifferenceContent += (offset / 60).toFixed() + ' hrs';

    const timeContent = formatTime(cityDate);

    const additionaActionClasses = this.showSettings ? '' : 'actions-hidden';
    const subclockContent = `
        <div class="subclock-container">
          <div class="subclock-item">
            <div class="subclock-city-name">${entry.name}</div>
            <div class="subclock-time-difference">${timeDifferenceContent}</div>
            <div class="subclock-time">${timeContent}</div>
          </div>
          <div class="subclock-actions ${additionaActionClasses}">
            <svg class="subclock-remove" fill="#ccc" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              <path d="M0 0h24v24H0z" fill="none"/>
            </svg>
          </div>
        </div>
        `;
    const el = document.createElement('div');
    el.innerHTML = subclockContent;

    const removeEl = el.querySelector('.subclock-remove')!;
    removeEl.addEventListener('click', () => {
      this.removeSubClock(entry);
    });

    return el;
  }

  private invalidate() {
    this.previousDate = undefined;
    this.start();
  }
}

// --- Init

function init() {
  let subClocksStore: SubClocksStore;
  createSubClocksStore()
    .then(store => {
      subClocksStore = store;
      return store.getEntries();
    })
    .then(entries => {
      const app = new App(entries, subClocksStore);
      app.start();
    });
}

document.addEventListener('DOMContentLoaded', init);
