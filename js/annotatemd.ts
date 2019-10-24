/*
AnnotateMD:
    Provides annotations for MarkDown-based websites. Allows patterns like:
        <p...>...</p>
        <img>...</img>
   to be containerized like:
        <div class="sample-image>
            <p.../>
            <img.../>
        </div>
   or whatever of that nature
 */


// Define a really general Pattern class that we'll use for our incremental DOM matching procedure
class Pattern {
    matcher: (this: Pattern, node: HTMLElement, match: Array<HTMLElement>) => number;
    compounds: boolean;
    match: Array<HTMLElement>;

    constructor(
        matcher: (this: any, node: any) => number,
        compounds = false
    ) {
        this.matcher = matcher.bind(this);
        this.compounds = compounds;
        this.match = [];
    }

    matches(node: HTMLElement): number {
        return this.matcher(node, this.match);
    }


}

// Define a set of HTML



class Annotator {
    constructor({
        class_transforms = [],
        sequence_patterns = []
    }={}) {
        this.simple_patterns = class_transforms.map(ClassTransformer);
        this.sequence_patterns =
    }
}