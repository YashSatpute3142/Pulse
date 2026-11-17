
import http from 'node:http';

let loggedIn = false;

const user = {
    id: 'u1',
    username: 'yash',
    displayName: 'Yash',
    avatarUrl: null,
    email: 'yash@example.com',
    settings: {
        theme: 'system'
    }
};

const send = (res, code, body) => {
    res.writeHead(code, {
        'Content-Type': 'application/json'
    });

    res.end(body === undefined ? undefined : JSON.stringify(body));
};

http.createServer((req, res) => {
    const route = `${req.method} ${req.url.split('?')[0]}`;

    if (route === 'POST /api/v1/auth/refresh') {
        return loggedIn
            ? send(res, 200, { data: { user, accessToken: 'mock' } })
            : send(res, 401, {
                error: {
                    code: 'UNAUTHENTICATED',
                    message: 'No session'
                }
            });
    }

    if (
        route === 'POST /api/v1/auth/login' ||
        route === 'POST /api/v1/auth/register'
    ) {
        loggedIn = true;
        return send(res, 200, {
            data: { user, accessToken: 'mock' }
        });
    }

    if (route === 'POST /api/v1/auth/logout') {
        loggedIn = false;
        return send(res, 204);
    }

    if (route === 'POST /api/v1/auth/ws-ticket') {
        return send(res, 200, {
            data: { ticket: 'mock', expiresInSec: 30 }
        });
    }

    if (route === 'PATCH /api/v1/users/me/settings') {
        return send(res, 200, { data: user });
    }

    send(res, 404, {
        error: {
            code: 'NOT_FOUND',
            message: 'Not in mock'
        }
    });

}).listen(8080, () => {
    console.log('Mock API on http://localhost:8080');
});
