/// <reference path="../annotatemd.ts" />


namespace AnnotateMD.Annotations {

    class TagAddClassTransform extends AnnotateMD.TagPattern {
        addClass: string;

        constructor(tags: string[], addClass: string,
                    {
                        priority = 0,
                        compounds = true,
                        open_ended = true,
                        manage_match = true
                    } = {}
        ) {
            super(tags,
                {
                    priority: priority,
                    compounds: compounds,
                    open_ended: open_ended,
                    manage_match: manage_match,
                    transform: match => TagAddClassTransform.add_classes(match, this.addClass)
                }
            );

        }

        static add_classes(match: PatternMatch, addClass: string) {
            match.nodes.forEach(
                m => TagAddClassTransform.add_class(m, addClass)
            );
        }
        static add_class(match: PatternMatch | Element | Node, addClass: string) {
            if (match instanceof PatternMatch) {
                TagAddClassTransform.add_classes(match, addClass)
            } else if (match instanceof Element) {
                match.classList.add(addClass);
            } else if (match.nodeType === Node.ELEMENT_NODE) {
                TagAddClassTransform.add_class(match as Element, addClass);
            }
        }
    }

}
