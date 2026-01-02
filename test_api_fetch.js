const axios = require('axios');

async function testApi() {
    try {
        console.log("Fetching orders from API...");
        // Assuming default port 5000, modify if needed based on .env
        const res = await axios.get('http://localhost:5000/api/admin/homemade-food/orders');

        console.log(`Status: ${res.status}`);
        console.log(`Total: ${res.data.total}`);
        console.log(`Data Length: ${res.data.data?.length}`);

        if (res.data.data?.length > 0) {
            console.log("First Order:", JSON.stringify(res.data.data[0], null, 2));
        } else {
            console.log("No orders found in API response.");
        }
    } catch (e) {
        console.error("API Error:", e.message);
        if (e.response) {
            console.error("Data:", e.response.data);
        }
    }
}

testApi();
