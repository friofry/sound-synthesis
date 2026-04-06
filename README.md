[![CI](https://github.com/friofry/sound-synthesis/actions/workflows/ci.yml/badge.svg)](https://github.com/friofry/sound-synthesis/actions/workflows/ci.yml)

# Sound Synthesis

Create your own instrument and play the music of your soul with it.

Sound Synthesis is an experimental playground for building unusual virtual instruments from physical models. Instead of using a fixed piano, guitar, or synth preset, you design a structure of points and elastic connections, simulate how it vibrates, and turn that motion into sound.

Imagine a familiar melody played by an alien bird, a drum that sings, or a strange resonator performing your favorite tune. This project is about creating funny, unexpected, and expressive instruments, then using them to play music in a completely new way.

[Live demo](https://sound-synthesis.a.frfry.com/)

## Project Structure

- `src/components/GraphEditor` - graph editor, tools, dialogs, and canvas interaction
- `src/components/PianoPlayer` - keyboard playback, oscillogram, spectrum, and instrument controls
- `src/components/Viewer3D` - 3D membrane visualization
- `src/components/ui` - reusable UI components
- `src/engine` - simulation, note generation, file formats, and WAV export
- `src/store` - application state stores
- `src/pages` - main application screens
- `e2e` - Playwright end-to-end tests
- `.storybook` - Storybook configuration

## How Sound Is Generated

The instrument is represented as a graph of points connected by elastic links. Each point has displacement `u`, velocity `v`, mass, and connection stiffness. From this graph we build a sparse stiffness matrix `K`, then compute acceleration for each time step:

`a(u, v) = K * u - alpha * v - beta * |v| * v`

where:

- `u` is displacement
- `v` is velocity
- `K` is the sparse matrix built from graph connections
- `alpha` is linear damping
- `beta` is nonlinear damping

The system is integrated in time with one of two numerical methods:

- `Euler-Cramer`
- `Runge-Kutta (RK4)`

Related references:

- `Euler-Cramer` is a variant of the [Euler method](https://en.wikipedia.org/wiki/Euler_method)
- `Runge-Kutta (RK4)` belongs to the [Runge-Kutta methods](https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods) family

For `Euler-Cramer`, the update is:

`v(t + dt) = v(t) + a(t) * dt`  
`u(t + dt) = u(t) + v(t + dt) * dt`

For `Runge-Kutta`, the simulator evaluates several intermediate states on each step and combines them to get a more accurate next value.

The output signal is taken from the selected `playingPoint`:

`s[n] = u_playingPoint(n)`

This sampled displacement becomes the waveform of a note. The final buffer is then exported as a `16-bit PCM WAV` file.

The physical behavior of elastic points and restoring forces in this model is related to the [harmonic oscillator](https://en.wikipedia.org/wiki/Harmonic_oscillator) concept.

## Documentation

[Project documentation](http://swsoft.nsu.ru/~iivanov/)
