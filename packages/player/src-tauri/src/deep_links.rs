pub fn profile_link_arguments(arguments: impl IntoIterator<Item = String>) -> Option<Vec<String>> {
    let mut arguments = arguments.into_iter();
    let executable = arguments.next()?;
    let mut has_profile = false;
    let mut remaining = Vec::new();
    while let Some(argument) = arguments.next() {
        if argument == "--profile" {
            arguments.next()?;
            has_profile = true;
        } else {
            remaining.push(argument);
        }
    }
    if has_profile && remaining.len() == 1 {
        Some(vec![executable, remaining.remove(0)])
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::profile_link_arguments;

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn forwards_a_video_link_with_a_named_profile() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "--profile",
                "qa-links",
                "cartermedia://watch/dQw4w9WgXcQ",
            ])),
            Some(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ]))
        );
    }

    #[test]
    fn supports_a_profile_after_the_link() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
                "--profile",
                "qa-links",
            ])),
            Some(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ]))
        );
    }

    #[test]
    fn leaves_standard_launch_arguments_to_the_plugin() {
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "cartermedia://watch/dQw4w9WgXcQ",
            ])),
            None
        );
    }

    #[test]
    fn ignores_non_link_profile_launches() {
        assert_eq!(
            profile_link_arguments(arguments(&["CarterMedia.exe", "--profile", "qa-links"])),
            None
        );
        assert_eq!(
            profile_link_arguments(arguments(&[
                "CarterMedia.exe",
                "--profile",
                "qa-links",
                "cartermedia://watch/dQw4w9WgXcQ",
                "extra",
            ])),
            None
        );
    }
}
