# Shield lashing

Shields may be lashed to containers with available lash slots when the container is a
`Backpack`, `Saddle`, or `Saddle, Pack` (name matching ignores case and surrounding
whitespace). A custom container may opt in with `system.supportsShieldLashing: true`.
Set that field to `false` to opt out, including for one of the default names. A shield
never uses clothing mounts such as a Belt, and a Sidesack is not a default shield host;
the custom override applies only to containers, not clothing.

Lash slot usage honors each lashed item's numeric `slotCost` (defaulting to one), and
the shield itself is excluded while checking a reordering or toggle operation.
