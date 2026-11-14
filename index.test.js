const request = require('supertest');
const app = require('./index');

describe('Express App Endpoints', () => {
  it('GET /health should return 200 with pass status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'pass' });
  });

  it('GET /stress?ms=10 should return 200 and burn CPU message for 10ms', async () => {
    const start = Date.now();
    const res = await request(app).get('/stress?ms=10');
    const elapsed = Date.now() - start;
    
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual('burned CPU for 10ms');
    expect(elapsed).toBeGreaterThanOrEqual(8);
  });

  it('GET /hello should return Hello, World! by default', async () => {
    const res = await request(app).get('/hello');
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual('Hello, World!');
  });

  it('GET /hello?name=Alaa-Eldeen should return Hello, Alaa-Eldeen!', async () => {
    const res = await request(app).get('/hello?name=Alaa-Eldeen');
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual('Hello, Alaa-Eldeen!');
  });

  it('GET /hello should return plain text so input is not rendered as HTML', async () => {
    const res = await request(app).get('/hello?name=<script>alert(1)</script>');
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.headers['x-content-type-options']).toEqual('nosniff');
  });

  it('GET /stress should clamp negative values to 0ms', async () => {
    const res = await request(app).get('/stress?ms=-100');
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual('burned CPU for 0ms');
  });

  it('GET /stress should fall back to 200ms for invalid input', async () => {
    const res = await request(app).get('/stress?ms=abc');
    expect(res.statusCode).toEqual(200);
    expect(res.text).toEqual('burned CPU for 200ms');
  });
});
