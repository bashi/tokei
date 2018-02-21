function formatTime(date: Date): string {
    const timeString = date.toLocaleTimeString();
    const hours = date.getHours().toString();
    const minutes = ('00' + date.getMinutes().toString()).slice(-2);
    return `${hours}:${minutes}`;
}

interface SubClockEntry {
    placeId: string;
    name: string;
    formattedAddress: string;
    utcOffsetInMinuts: number;
}

// --- Storage
// TODO: Don't use localStorage
const STORAGE_KEY = 'subclocks-v2';

function getSubClockEntries(): Promise<Array<SubClockEntry>> {
    return new Promise((resolve) => {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const entries = JSON.parse(data);
            resolve(entries);
        } else {
            resolve([]);
        }
    });
}

function storeSubClockEntries(entries: Array<SubClockEntry>) {
    return new Promise((resolve) => {
        const data = JSON.stringify(entries);
        localStorage.setItem(STORAGE_KEY, data);
        resolve();
    });
}

// --- APIs

declare const google: any;

function autocompleteCity(city: string): Promise<Array<any>> {
    const service: any = new google.maps.places.AutocompleteService();
    const params = {
        input: city,
        types: ['(cities)'],
    };
    return new Promise((resolve, reject) => {
        service.getPlacePredictions(params, (pred: any, status: string) => {
            if (status === 'ZERO_RESULTS') {
                resolve([]);
            }
            if (status !== 'OK') {
                reject(status);
            }
            resolve(pred);
        });
    });
}

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
    return placeDetails(placeId)
        .then(detail => {
            return {
                placeId: placeId,
                name: detail.name,
                formattedAddress: detail.formatted_address,
                description: description,
                utcOffsetInMinuts: detail.utc_offset,
            }
        });
}

// --- New SubClock

class SubClockAddPane {
    private app: App;
    private el: HTMLElement;
    private queryEl: HTMLInputElement;
    private autocomplete: any;  // Google Places Autocomplete.

    constructor(app: App) {
        this.app = app;
        this.el = document.querySelector('.add-subclock-pane') as HTMLElement;
        this.el.hidden = true;

        this.queryEl = this.el.querySelector('.city-autocomplete-field') as HTMLInputElement;
        const options = {
            types: ['(cities)'],
        };
        this.autocomplete = new google.maps.places.Autocomplete(this.queryEl, options);
        google.maps.event.addListener(this.autocomplete, 'place_changed', () => this.placeChanged());
    }

    show() {
        this.el.hidden = false;
    }

    hide() {
        this.el.hidden = true;
    }

    private placeChanged() {
        const place = this.autocomplete.getPlace();
        if (!place) {
            return;
        }
        const entry = {
            placeId: place.place_id,
            name: place.name,
            formattedAddress: place.formatted_address,
            utcOffsetInMinuts: place.utc_offset,
        };
        this.app.addSubClock(entry);
    }
}

// --- App

class App {
    private previousDate?: Date;
    private subclocks: Array<SubClockEntry>;
    private showSettings: boolean;

    private addPane: SubClockAddPane;

    constructor(subclocks: Array<SubClockEntry>) {
        this.subclocks = subclocks;
        this.addPane = new SubClockAddPane(this);
        this.showSettings = false;

        const settingsIcon = document.querySelector('.settings-icon')!;
        settingsIcon.addEventListener('click', (e) => {
            this.toggleSettings();
        });
    }

    start() {
        this.update();
    }

    addSubClock(entry: SubClockEntry) {
        this.subclocks.push(entry);
        storeSubClockEntries(this.subclocks)
            .then(() => this.invalidate());
    }

    removeSubClock(target: SubClockEntry) {
        const subclocks = [];
        for (let entry of this.subclocks) {
            if (entry.placeId !== target.placeId) {
                subclocks.push(entry);
            }
        }
        this.subclocks = subclocks;
        storeSubClockEntries(this.subclocks)
            .then(() => this.invalidate());
    }

    toggleSettings() {
        const actionEls = document.querySelectorAll('.subclock-actions');

        this.showSettings = !this.showSettings;
        if (this.showSettings) {
            this.addPane.show();
            actionEls.forEach((el) => el.classList.remove('actions-hidden'));
        } else {
            this.addPane.hide();
            actionEls.forEach((el) => el.classList.add('actions-hidden'));
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
    getSubClockEntries().then(entries => {
        const app = new App(entries);
        app.start();
    });
}

document.addEventListener('DOMContentLoaded', init);
