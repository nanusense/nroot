export default function HowToModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal howto-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="howto-modal__close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="modal__title">How to use NRoot</h2>

        <div className="howto-body">

          {/* Basics */}
          <section className="howto-section">
            <h3 className="howto-section__title">Getting started</h3>
            <p>
              Each card on the canvas represents one person. Hover over any card to see
              the four small arrow buttons around it, which let you add a new person
              in that relationship direction. Double-click a card to edit the name or
              birth year.
            </p>
          </section>

          {/* Four directions */}
          <section className="howto-section">
            <h3 className="howto-section__title">The four relationship buttons</h3>

            <div className="howto-cards">
              <div className="howto-card">
                <span className="howto-card__icon">↑</span>
                <div>
                  <strong>Add Parent</strong>
                  <p>Places a new card <em>above</em> the current person. Use this for a father, mother, grandfather, grandmother, or guardian. The line drawn upward represents "this person was born to".</p>
                </div>
              </div>

              <div className="howto-card">
                <span className="howto-card__icon">↓</span>
                <div>
                  <strong>Add Child</strong>
                  <p>Places a new card <em>below</em> the current person. Use this for sons, daughters, adopted or step-children. When you add a second child, a dashed line automatically appears between them to mark them as siblings.</p>
                </div>
              </div>

              <div className="howto-card">
                <span className="howto-card__icon">→</span>
                <div>
                  <strong>Add Spouse</strong>
                  <p>Places a new card <em>to the right</em> (or left if the right side is already taken). Use this for a wife, husband, or partner. A solid pink line connects spouses. Any children of this person are automatically also linked to the new spouse.</p>
                </div>
              </div>

              <div className="howto-card">
                <span className="howto-card__icon">←</span>
                <div>
                  <strong>Add Sibling</strong>
                  <p>Places a new card on the <em>same generation row</em> as the current person. A dashed line connects them as brothers or sisters. When you add a sibling, they are also automatically cross-linked to all other siblings already in the group.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Link existing */}
          <section className="howto-section">
            <h3 className="howto-section__title">Linking people who are already in the tree</h3>
            <p>
              Sometimes a connection is missing, for example, a cousin who was added
              independently, or a second marriage. To link two existing people:
            </p>
            <ol className="howto-steps">
              <li>Click any arrow button (↑ ↓ → ←) on one of the cards.</li>
              <li>In the panel that opens, switch from <strong>New person</strong> to <strong>Link existing</strong>.</li>
              <li>Start typing a name in the search box. The list filters as you type.</li>
              <li>Pick the relationship type and label, then click <strong>Link</strong>.</li>
            </ol>
            <p>This draws the correct line between the two without creating a duplicate card.</p>
            <p className="howto-tip-inline">
              <strong>Tip:</strong> If two people share the same name, the search shows each person's birth year next to their name so you can tell them apart. This is why it is worth adding a birth year to every person in the tree, as it makes linking unambiguous.
            </p>
          </section>

          {/* Hover highlights */}
          <section className="howto-section">
            <h3 className="howto-section__title">Hover highlights</h3>
            <p>
              Hovering over a person dims everyone else and lights up only their
              immediate family: parents, spouse, children, and siblings.
            </p>
          </section>

          {/* Auto-arrange */}
          <section className="howto-section">
            <h3 className="howto-section__title">Auto-arrange</h3>
            <p>
              If the tree looks cluttered after many additions, click <strong>Auto-arrange</strong>{' '}
              in the toolbar. It repositions everyone into clean generation rows,
              grandparents at the top, parents in the middle, children at the bottom.
            </p>
          </section>

          {/* Search */}
          <section className="howto-section">
            <h3 className="howto-section__title">Finding someone quickly</h3>
            <p>
              With a large tree it can be hard to spot a specific person by scrolling. Use the
              {' '}<strong>search bar</strong> in the toolbar to jump straight to anyone by name.
              Type a few letters, pick the person from the results, and the canvas will pan and
              zoom directly to their card.
            </p>
          </section>

          {/* Tips */}
          <section className="howto-section">
            <h3 className="howto-section__title">A few tips</h3>
            <ul className="howto-tips">
              <li>You can drag any card to reposition it freely on the canvas.</li>
              <li>Use the scroll wheel (or pinch on mobile) to zoom in and out.</li>
              <li>Click the <strong>×</strong> on a card to remove that person. You will be asked to confirm first.</li>
              <li>Changes are saved automatically and shared in real time, and anyone with the link sees the same tree.</li>
            </ul>
          </section>

        </div>

        <footer className="howto-footer">
          Created by Sandeep Nanu. For a custom family tree like this, or to report bugs or request changes, write to{' '}
          <a href="mailto:shiftingradius@gmail.com">shiftingradius@gmail.com</a>
        </footer>
      </div>
    </div>
  )
}
