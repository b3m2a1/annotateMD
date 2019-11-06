/// <reference path="../annotatemd.ts" />
/// <reference path="../annotations/simple_transforms.ts" />

// define our composite set of annotations to be applie here
let annotator = new AnnotateMD.Annotator(
    [
        new AnnotateMD.SequencePattern(
            [
                // we do these as separate things since the inner one has its state turned off
                new AnnotateMD.TagPattern([ "h1", "h2", "h3", "h4", "h5"] ),
                new AnnotateMD.ExceptPattern(new AnnotateMD.TagPattern([ "h1", "h2", "h3", "h4", "h5"])),
            ],
            [ [1, 1],  [1, -1] ],
            {
                transform: AnnotateMD.Annotations.SectionMaker({
                    section_class: ["card", "m-1"],
                    header_class: "card-header",
                    body_class: "card-body"
                })
            }
        )
        // new AnnotateMD.TagPattern([ "ul", "pre" ], { terminal: true, all: false }),
        // new AnnotateMD.TagPattern(
        //     [ "p" ],
        //     {
        //         transform: AnnotateMD.Annotations.ClassAdder("test")
        //     }
        // ),
        // new AnnotateMD.TagPattern(
        //     [ "p" ],
        //     {
        //         transform: AnnotateMD.Annotations.ClassAdder("test")
        //     }
        // ),
        // new AnnotateMD.SequencePattern(
        //     [
        //         new AnnotateMD.TagPattern([ "p" , "a", "span"])
        //     ],
        //     [ [2, -1] ],
        //     {
        //         transform: AnnotateMD.Annotations.ClassAdder("test-2")
        //     }
        // )
    ]
);


// Apply the annotations to the chosen root element
let root = document.getElementById("root");
annotator.apply(root);
