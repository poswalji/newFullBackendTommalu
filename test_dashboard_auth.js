const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: '691760c0ff0dbd58a8ece5a5', type: 'access', role: 'admin', adminRole: 'superAdmin' }, 'tommalu123', { expiresIn: '1h' });
const axios = require('axios');
axios.get('http://127.0.0.1:5000/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } })
.then(res => console.log(JSON.stringify(res.data, null, 2)))
.catch(e => console.error(e.response?.data || e.message));
