const sectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
} as const;

const headingStyle = { fontSize: "1rem", marginTop: "0.4rem" } as const;

export function RulesScreen() {
  return (
    <div
      style={{
        maxWidth: 760,
        margin: "2rem auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        padding: "0 1rem",
      }}
    >
      <h2>Rules Reference</h2>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>The Board</h3>
        <p>
          The base board is 19 hexes: 4 wood, 4 wheat, 4 sheep, 3 brick, 3 ore, and 1 desert. Number
          tokens 2–12 (excluding 7) are placed on every non-desert hex, and the two "red" numbers (6
          and 8) are never adjacent to each other. Nine harbors sit on the coastline — four generic
          3:1 harbors and five resource-specific 2:1 harbors, one per resource.
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Setup</h3>
        <p>
          Turn order is decided, then every player places their first settlement and an adjacent
          road, in order. Once the last player has placed, the order reverses and every player
          places a <em>second</em> settlement and road — the second settlement immediately grants
          one resource card for each adjacent hex (nothing for the desert).
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>A Turn</h3>
        <ol
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <li>
            <strong>Roll.</strong> Every hex whose number matches the roll produces: 1 resource for
            each adjacent settlement, 2 for each adjacent city. A hex under the robber never
            produces.
          </li>
          <li>
            <strong>Trade.</strong> Trade with other players freely, or with the bank at 4:1 (3:1 at
            a generic harbor, 2:1 at a matching resource harbor).
          </li>
          <li>
            <strong>Build.</strong> Roads cost 1 wood + 1 brick; settlements cost 1 wood + 1 brick +
            1 wheat + 1 sheep; cities (upgrading an existing settlement) cost 3 ore + 2 wheat;
            development cards cost 1 ore + 1 wheat + 1 sheep. You may play at most one development
            card per turn, and never one bought this same turn — except Victory Point cards, which
            are never "played" at all, just held.
          </li>
        </ol>
        <p>
          Rolling a <strong>7</strong> skips production entirely: every player holding more than 7
          cards discards half (rounded down), then the roller moves the robber to any hex and steals
          one random card from a player with a settlement or city adjacent to it.
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Building Rules</h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <li>
            A new settlement must be at least two edges away from every existing settlement or city
            — yours or anyone else's.
          </li>
          <li>A road must connect to one of your own roads, settlements, or cities.</li>
          <li>Piece limits per player: 15 roads, 5 settlements, 4 cities.</li>
        </ul>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Development Cards</h3>
        <p>
          The deck holds 25 cards: 14 Knights, 5 Victory Points, 2 Monopoly, 2 Road Building, and 2
          Year of Plenty. A Knight acts as an extra robber move; playing three or more Knights over
          the course of the game earns the <strong>Largest Army</strong> award (2 VP) as long as you
          hold the most — it can change hands if someone plays more.
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Awards</h3>
        <p>
          <strong>Longest Road</strong> goes to whoever has an unbroken chain of 5 or more of their
          own roads — worth 2 VP — and can be taken by another player who builds a longer chain.
          <strong> Largest Army</strong> works the same way for Knights played (3 or more), also
          worth 2 VP.
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Winning</h3>
        <p>
          The first player to reach the target victory point total (10 by default, configurable
          10–14 per lobby) <em>on their own turn</em> wins immediately.
        </p>
      </div>

      <h2 style={{ marginTop: "1rem" }}>Expansion Modules</h2>
      <p style={{ color: "var(--hh-text-dim)", marginTop: "-1rem" }}>
        A lobby's host can enable any combination of these when creating a game.
      </p>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>5–6 Players</h3>
        <p>
          Extends the board to 28 hexes and the bank to 24 of each resource (up from 19) to keep up
          with the extra demand, plus 9 extra development cards. The one new rule: right after a 5th
          or 6th player's turn ends, every other player — starting with whoever rolls next — gets
          one <strong>Special Building Phase</strong> in turn order to build a road, settlement,
          city, or buy a development card (no trading, no playing cards) before play returns to the
          normal roll.
        </p>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Seafarers-Style</h3>
        <p>
          Sends the game onto open water, across one of three scenario maps of scattered islands.
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <li>
            <strong>Ships</strong> (1 wood + 1 sheep) are built on coastal edges the same way roads
            are built on land, and connect your network the same way. Once per turn you may pick up
            and relocate any ship that isn't holding your network together.
          </li>
          <li>
            A second robber-like piece, the <strong>pirate</strong>, blocks ship movement near it
            and steals from a ship owner when moved — on a 7 or a Knight, you choose to move
            <em> either</em> the robber or the pirate, not both.
          </li>
          <li>
            Some islands start with hexes face-down. Sailing a ship or settlement next to one
            reveals it and hands you a free resource card of its terrain.
          </li>
          <li>
            The first settlement anyone builds on an island other than the starting one earns that
            player a permanent +1 VP.
          </li>
          <li>
            <strong>Longest Road</strong> becomes <strong>Longest Route</strong>: roads and ships
            count together, switching between the two only through a settlement or city you own.
          </li>
        </ul>
      </div>

      <div className="hh-card" style={sectionStyle}>
        <h3 style={headingStyle}>Cities &amp; Knights-Style</h3>
        <p>
          The largest expansion — replaces development cards with a deeper city-improvement game.
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <li>
            A city (not a settlement) on a sheep, ore, or wood hex produces a{" "}
            <strong>commodity</strong>— cloth, coin, or paper — instead of a second helping of the
            base resource.
          </li>
          <li>
            Spend commodities to raise your city's <strong>Trade</strong>, <strong>Politics</strong>
            , and <strong>Science</strong> tracks (levels 0–5, each level costing one more commodity
            than the last). Higher levels unlock progress card draws, knight promotions, and
            eventually a <strong>metropolis</strong> — an upgraded city worth 4 VP instead of 2,
            available only to a track's sole leader at level 4+.
          </li>
          <li>
            Every roll adds a third, six-sided <strong>event die</strong>: a Trade/Politics/Science
            face lets every player invested in that track draw a free progress card; a Barbarian
            face advances a shared threat track.
          </li>
          <li>
            <strong>Knights</strong> are board pieces, not cards: buy one (1 ore + 1 wheat + 1
            sheep), activate it (1 wheat) to make it count for defense, promote it with Politics
            track levels, and use an active knight to chase the robber off a hex without stealing.
          </li>
          <li>
            When the barbarian track fills, total cities across the table are compared to total
            active knight strength. Defenders share +1 VP each; if the barbarians win, the table's
            weakest defenders each downgrade one city back to a settlement.
          </li>
          <li>
            City walls (2 brick) raise your personal discard threshold above the usual 7 cards.
          </li>
          <li>Base development cards and Largest Army are disabled entirely under this module.</li>
        </ul>
      </div>
    </div>
  );
}
