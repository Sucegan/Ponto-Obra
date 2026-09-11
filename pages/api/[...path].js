const api = require('../../api/index');

export const config = {
    api: { bodyParser: false }
};

export default function handler(request, response) {
    return api(request, response);
}