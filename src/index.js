export default {
  async fetch(request, env) {
    return new Response("Second Horizon is running! 🚀", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  },
};
