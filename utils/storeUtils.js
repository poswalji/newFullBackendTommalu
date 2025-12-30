const getIndianTime = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const isStoreOpen = (store) => {
    // 1. Basic status check
    if (!store || !store.isOpen || store.status !== 'active') {
        return {
            isOpen: false,
            reason: 'Closed by owner'
        };
    }

    // 2. Time check
    if (!store.openingTime || !store.closingTime) {
        return {
            isOpen: true, // Default to open if no times set
            reason: 'No timing set'
        };
    }

    const now = getIndianTime();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    const [openHour, openVal] = store.openingTime.split(':').map(Number);
    const [closeHour, closeVal] = store.closingTime.split(':').map(Number);

    const openTimeMinutes = openHour * 60 + (openVal || 0);
    const closeTimeMinutes = closeHour * 60 + (closeVal || 0);

    // Handle overnight timing if closeTime < openTime (e.g., 6 PM to 2 AM)
    let isWithinTime = false;
    if (closeTimeMinutes < openTimeMinutes) {
        isWithinTime = currentTimeMinutes >= openTimeMinutes || currentTimeMinutes <= closeTimeMinutes;
    } else {
        isWithinTime = currentTimeMinutes >= openTimeMinutes && currentTimeMinutes <= closeTimeMinutes;
    }

    if (!isWithinTime) {
        return {
            isOpen: false,
            reason: 'Outside operating hours',
            nextOpen: store.openingTime
        };
    }

    return {
        isOpen: true
    };
};

module.exports = {
    isStoreOpen,
    getIndianTime
};
