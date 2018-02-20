function formatTime(date: Date): string {
    const timeString = date.toLocaleTimeString();
    const hours = date.getHours().toString();
    const minutes = ('00' + date.getMinutes().toString()).slice(-2);
    return `${hours}:${minutes}`;
}

interface SubClockEntry {
    name: string;
    formattedAddress: string;
    description: string;
    utcOffsetInMinuts: number;
}

function createSubClock(date: Date, entry: SubClockEntry): HTMLElement {
    const el = document.createElement('div');
    el.classList.add('subclock-container');
    const cityNameEl = document.createElement('div');
    cityNameEl.classList.add('subclock-city-name');
    cityNameEl.textContent = entry.name;
    el.appendChild(cityNameEl);

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

    const timeDifferenceEl = document.createElement('div');
    timeDifferenceEl.classList.add('subclock-time-difference');
    timeDifferenceEl.textContent = timeDifferenceContent;
    el.appendChild(timeDifferenceEl);

    const timeEl = document.createElement('div');
    timeEl.classList.add('subclock-time');
    timeEl.textContent = formatTime(cityDate);
    el.appendChild(timeEl);
    return el;
}

function updateSubClocks(date: Date, entries: Array<SubClockEntry>) {
    const subclockListEl = document.querySelector('.subclock-list')!;
    subclockListEl.innerHTML = '';
    for (let entry of entries) {
        const subclockEl = createSubClock(date, entry);
        subclockListEl.appendChild(subclockEl);
    }
}

function updateMainClock(date: Date) {
    const mainClockTime = document.querySelector('.main-clock-time')!;
    mainClockTime.textContent = formatTime(date);

    const mainClockDate = document.querySelector('.main-clock-date')!;
    mainClockDate.textContent = date.toDateString();
}

// --- Storage

function getSubClockEntries(): Promise<Array<SubClockEntry>> {
    // TODO: Don't use localStorage
    const key = 'subclocks-v1';
    return new Promise((resolve) => {
        const data = localStorage.getItem(key);
        if (data) {
            const entries = JSON.parse(data);
            resolve(entries);
        } else {
            // Set mock entries for the next time.
            getMockSubClockEntries()
                .then(mockEntries => {
                    const data = JSON.stringify(mockEntries);
                    localStorage.setItem(key, data);
                    resolve(mockEntries);
                });
        }
    });
}

function getMockSubClockEntries(): Promise<Array<SubClockEntry>> {
    const mockEntries: Array<SubClockEntry> = [
        {
            name: 'Mountain View',
            formattedAddress: 'Mountain View',
            description: 'Mountain View',
            utcOffsetInMinuts: -480,
        },
        {
            name: 'Milan',
            formattedAddress: 'Milan',
            description: 'Milan',
            utcOffsetInMinuts: 60,
        },
        {
            name: 'Sydney',
            formattedAddress: 'Sydney',
            description: 'Sydney',
            utcOffsetInMinuts: 660,
        },
    ];
    return Promise.resolve(mockEntries);
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

function createCityEntry(description: string, details: any): SubClockEntry {
    return {
        name: details.name,
        formattedAddress: details.formatted_address,
        description: description,
        utcOffsetInMinuts: details.utc_offset,
    };
}

function getCityEntry(description: string, placeId: string): Promise<SubClockEntry> {
    return placeDetails(placeId)
        .then(detail => createCityEntry(description, detail));
}

// --- App

class App {
    private previousDate?: Date;
    private subclocks: Array<SubClockEntry>;

    constructor(subclocks: Array<SubClockEntry>) {
        this.subclocks = subclocks;
    }

    start() {
        this.update();
        setInterval(() => this.update(), 1000);
    }

    private update() {
        const date = new Date();
        if (!this.previousDate || this.previousDate.getMinutes() !== date.getMinutes()) {
            this.updateInternal(date);
        }
    }

    private updateInternal(date: Date) {
        updateMainClock(date);
        updateSubClocks(date, this.subclocks);
        this.previousDate = date;
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
