import fetch, { Response } from 'node-fetch';
import FormData from 'form-data';

export class BugSplatApiClient {
    private _cookie: string = '';
    private _xsrfToken: string = '';

    constructor(private _host: string = 'https://app.bugsplat.com') { }

    async get(route: string): Promise<Response> {
        const url = new URL(route, this._host);
        return fetch(url, {
            headers: {
                cookie: this._cookie,
                'xsrf-token': this._xsrfToken
            }
        });
    }

    async post(route: string, body: FormData): Promise<Response> {
        const url = new URL(route, this._host);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                cookie: this._cookie,
                'xsrf-token': this._xsrfToken
            },
            body: body
        });
        return response;
    }

    async login(email: string, password: string): Promise<any> {
        try {
            const url = new URL('/api/authenticatev3.php', this._host);
            const formData: any = new FormData();
            formData.append('email', email);
            formData.append('password', password);
            formData.append('Login', 'Login');
            
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                redirect: 'follow'
            });
    
            const cookie = this.parseCookies(response);
            const xsrfToken = this.parseXsrfToken(cookie);
            this._cookie = cookie;
            this._xsrfToken = xsrfToken;
    
            return response.json();
        } catch (error) {
            throw new Error(`Could not login with username ${email}!`);
        }
    }


    private parseCookies(response: Response): string {
        return response.headers.get('set-cookie') ?? '';
    }

    private parseXsrfToken(cookie: string): string {
        const regex = new RegExp(/xsrf-token=[^;]*/g);
        const matches = Array.from(cookie.matchAll(regex));
        const xsrfCookie = matches[0][0];
        const xsrfToken = xsrfCookie.split('=')[1];
        return xsrfToken;
    }
}