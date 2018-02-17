"use strict";
function createSubClock(entry) {
    const el = document.createElement('div');
    el.classList.add('subclock-container');
    const cityNameEl = document.createElement('div');
    cityNameEl.classList.add('subclock-city-name');
    cityNameEl.textContent = entry.cityName;
    el.appendChild(cityNameEl);
    const timeDifferenceEl = document.createElement('div');
    timeDifferenceEl.classList.add('subclock-time-difference');
    timeDifferenceEl.textContent = entry.timeDifference;
    el.appendChild(timeDifferenceEl);
    const timeEl = document.createElement('div');
    timeEl.classList.add('subclock-time');
    timeEl.textContent = entry.time;
    el.appendChild(timeEl);
    return el;
}
function updateClocks() {
    const date = new Date();
    const mainClockTime = document.querySelector('.main-clock-time');
    const mainTime = date.toLocaleTimeString();
    mainClockTime.textContent = mainTime.substr(0, mainTime.length - 3);
    const mainClockDate = document.querySelector('.main-clock-date');
    mainClockDate.textContent = date.toDateString();
    const subclockListEl = document.querySelector('.subclock-list');
    subclockListEl.innerHTML = '';
    // TODO: Implement
    let mockTime = date.toLocaleTimeString('en-US', { timeZone: 'GMT' });
    const mockEntries = [
        {
            cityName: 'Mountain View',
            timeDifference: 'Yesterday, -17 hrs',
            time: mockTime,
        },
        {
            cityName: 'Milan',
            timeDifference: '-8 hrs',
            time: mockTime,
        },
    ];
    for (let entry of mockEntries) {
        const subclockEl = createSubClock(entry);
        subclockListEl.appendChild(subclockEl);
    }
}
function init() {
    updateClocks();
    setInterval(updateClocks, 1000);
}
document.addEventListener('DOMContentLoaded', init);
