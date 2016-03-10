# Multishot

_Multi-iterative distributed computation for use with [COINSTAC](https://github.com/MRN-Code/coinstac)._

Please visit [coinstac-decentralized-algorithm-integration](https://github.com/MRN-Code/coinstac-decentralized-algorithm-integration) for more information on COINSTAC’s distrubuted computations.

## Setup

Make sure you have [Node.js](https://nodejs.org/en/) and NPM installed (Node.js comes with NPM).

1. Clone this repository to your machine
2. `cd` into the repository’s directory
3. Run `npm install` to install dependencies

## Contributing

* This project adheres to the [Airbnb JavaScript style guide](https://github.com/airbnb/javascript).
* This project uses [pre-commit](https://www.npmjs.com/package/pre-commit) to validate packages, lint code, and run tests before a commit. Make sure your code passes!

## Testing

This project is wired up with [Istanbul](https://github.com/gotwarlost/istanbul) for measuring code coverage [tape](https://www.npmjs.com/package/tape) for testing. To run the tests and measure coverage, simply run:

```shell
npm test
```

To check linting, run:

```shell
npm run lint
```

## License

MIT. See [LICENSE](./LICENSE).
