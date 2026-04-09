# Hammer Impulse Model

In short: the hammer no longer injects initial displacement `u` (`amplitude`). It injects only initial velocity `v`, computed from an impact formula.

## 1. Grid Node Dynamics

For node `i`:

$$
\dot{v}_i = \sum_j \frac{k_{ij}}{m_i}(u_j - u_i) - \alpha \cdot v_i
$$

Here `weight` is the node mass `m_i`, and it appears in the denominator. That is why the connection matrix uses `k / weight`:

```ts
addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
addCoeff(line.dot1, line.dot2, line.k / d1.weight);
addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
addCoeff(line.dot2, line.dot1, line.k / d2.weight);
```

## 2. Velocity After Hammer Impact

Notation:
- `M_h`: hammer mass
- `V_h`: hammer velocity before impact
- `m_i`: grid node mass
- `e`: restitution coefficient, `e in [0, 1]`

General form:

$$
v_i = \frac{(1 + e) M_h}{M_h + m_i} \cdot V_h
$$

Special cases:

- Perfectly elastic impact (`e = 1`)

$$
v_i = \frac{2 M_h}{M_h + m_i} \cdot V_h
$$

- Perfectly inelastic impact (`e = 0`)

$$
v_i = \frac{M_h}{M_h + m_i} \cdot V_h
$$

## 3. Hammer Tool Behavior

- Initial displacement is zero: `u = 0`.
- Nodes inside the contact region receive only velocity `v_i`.
- Impact strength is scaled by charge: $V_{h,\mathrm{eff}} = V_h \cdot charge$.

