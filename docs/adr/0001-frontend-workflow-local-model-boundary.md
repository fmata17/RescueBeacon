# Keep the demo workflow in the frontend and local inference behind a backend

The frontend owns scenario selection, case state, and simulated drone and response events. It consumes structured assessments from a backend endpoint; until that endpoint is ready, the same interface consumes scripted assessments. The backend owns calls to the locally hosted vision-language model through an OpenAI-compatible client. This boundary lets the frontend team demonstrate the workflow independently while keeping model protocol and inference details out of the browser.
